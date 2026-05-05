export interface AnthropicMessageRequest {
  model?: string;
  system?: string | Array<{ type?: string; text?: string }>;
  messages?: Array<{ role: 'user' | 'assistant'; content: string | Array<Record<string, unknown>> }>;
  tools?: Array<{ name?: string; description?: string; input_schema?: Record<string, unknown> }>;
  tool_choice?: { type?: string; name?: string; disable_parallel_tool_use?: boolean };
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  stop?: string | string[];
  stream?: boolean;
  [key: string]: unknown;
}

export interface OpenAIChatRequest {
  model?: string;
  messages?: Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
  tool_choice?: string | Record<string, unknown>;
  parallel_tool_calls?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  stream?: boolean;
  [key: string]: unknown;
}

export function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      if (typeof block === 'string') return block;
      if (block && typeof block === 'object' && (block as { type?: unknown }).type === 'text') {
        return String((block as { text?: unknown }).text ?? '');
      }
      const type = block && typeof block === 'object' ? String((block as { type?: unknown }).type ?? 'unknown') : 'unknown';
      throw new Error(`Unsupported Anthropic content block: ${type}`);
    })
    .filter(Boolean)
    .join('\n');
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function sanitizeAnthropicId(value: unknown): string {
  const fallback = `toolu_${Date.now()}`;
  const raw = typeof value === 'string' && value ? value : fallback;
  const sanitized = raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  return sanitized || fallback;
}

function imageUrlFromAnthropic(block: Record<string, any>): string | undefined {
  const source = block.source;
  if (!isRecord(source)) return undefined;
  if (source.type === 'url' && typeof source.url === 'string') return source.url;
  if (source.type === 'base64' && typeof source.media_type === 'string' && typeof source.data === 'string') {
    return `data:${source.media_type};base64,${source.data}`;
  }
  return undefined;
}

function openAIContentFromBlocks(blocks: Record<string, unknown>[]): string | Array<Record<string, unknown>> | undefined {
  const parts: Array<Record<string, unknown>> = [];
  for (const block of blocks) {
    if (block.type === 'text') {
      const text = String(block.text ?? '');
      if (text) parts.push({ type: 'text', text });
      continue;
    }
    if (block.type === 'image') {
      const url = imageUrlFromAnthropic(block);
      if (url) parts.push({ type: 'image_url', image_url: { url } });
    }
  }
  if (parts.length === 0) return undefined;
  if (parts.every((part) => part.type === 'text')) return parts.map((part) => String(part.text ?? '')).join('\n');
  return parts;
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content ?? '');
  return content
    .map((block) => {
      if (typeof block === 'string') return block;
      if (block && typeof block === 'object' && (block as { type?: unknown }).type === 'text') {
        return String((block as { text?: unknown }).text ?? '');
      }
      return JSON.stringify(block ?? null);
    })
    .join('\n');
}

function toolUseToOpenAICall(block: Record<string, any>): Record<string, unknown> {
  return {
    id: sanitizeAnthropicId(block.id),
    type: 'function',
    function: {
      name: String(block.name ?? 'tool'),
      arguments: JSON.stringify(block.input ?? {}),
    },
  };
}

function anthropicMessagesToOpenAI(messages: AnthropicMessageRequest['messages']): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const message of messages ?? []) {
    if (typeof message.content === 'string') {
      out.push({ role: message.role, content: message.content });
      continue;
    }
    const blocks = message.content.filter(isRecord);
    const toolUses = blocks.filter((block) => block.type === 'tool_use');
    if (message.role === 'assistant' && toolUses.length > 0) {
      const content = openAIContentFromBlocks(blocks.filter((block) => block.type !== 'tool_use'));
      out.push({
        role: 'assistant',
        content: typeof content === 'string' && content ? content : null,
        tool_calls: toolUses.map(toolUseToOpenAICall),
      });
      continue;
    }

    const pendingContentBlocks: Record<string, unknown>[] = [];
    const flushContent = () => {
      const content = openAIContentFromBlocks(pendingContentBlocks);
      pendingContentBlocks.length = 0;
      if (content !== undefined) out.push({ role: message.role, content });
    };

    for (const block of blocks) {
      if (block.type === 'tool_result') {
        flushContent();
        out.push({
          role: 'tool',
          tool_call_id: sanitizeAnthropicId(block.tool_use_id),
          content: stringifyToolResult(block.content),
        });
        continue;
      }
      if (block.type === 'text' || block.type === 'image') pendingContentBlocks.push(block);
    }
    flushContent();
  }
  return out;
}

function toolsToOpenAI(tools: AnthropicMessageRequest['tools']): OpenAIChatRequest['tools'] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools
    .filter((tool) => typeof tool.name === 'string' && tool.name)
    .map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema ?? { type: 'object' },
      },
    }));
}

function toolChoiceToOpenAI(toolChoice: AnthropicMessageRequest['tool_choice']): OpenAIChatRequest['tool_choice'] | undefined {
  if (!toolChoice?.type) return undefined;
  if (toolChoice.type === 'none') return 'none';
  if (toolChoice.type === 'auto') return 'auto';
  if (toolChoice.type === 'any') return 'required';
  if (toolChoice.type === 'tool' && toolChoice.name) {
    return { type: 'function', function: { name: toolChoice.name } };
  }
  return undefined;
}

function systemToText(system: AnthropicMessageRequest['system']): string | undefined {
  if (!system) return undefined;
  if (typeof system === 'string') return system;
  return system.map((block) => block.text ?? '').filter(Boolean).join('\n') || undefined;
}

export function anthropicToOpenAI(body: AnthropicMessageRequest, modelId: string): OpenAIChatRequest {
  const messages: Array<Record<string, unknown>> = [];
  const system = systemToText(body.system);
  if (system) messages.push({ role: 'system', content: system });
  return {
    model: modelId,
    messages: [...messages, ...anthropicMessagesToOpenAI(body.messages)],
    tools: toolsToOpenAI(body.tools),
    tool_choice: toolChoiceToOpenAI(body.tool_choice),
    ...(body.tool_choice?.disable_parallel_tool_use === true ? { parallel_tool_calls: false } : {}),
    max_tokens: body.max_tokens,
    temperature: body.temperature,
    top_p: body.top_p,
    stop: body.stop ?? body.stop_sequences,
    stream: body.stream,
  };
}

export function openAIToAnthropic(response: Record<string, any>, fallbackModel: string): Record<string, unknown> {
  const choice = response.choices?.[0] ?? {};
  const message = choice.message ?? {};
  const content = contentFromOpenAI(message.content ?? choice.text ?? message.refusal ?? '');
  const blocks: Array<Record<string, unknown>> = [];
  if (content) blocks.push({ type: 'text', text: content });
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const allToolCalls = message.function_call ? [...toolCalls, { id: `toolu_${Date.now()}`, type: 'function', function: message.function_call }] : toolCalls;
  for (const toolCall of allToolCalls) {
    if (toolCall?.type && toolCall.type !== 'function') continue;
    blocks.push({
      type: 'tool_use',
      id: sanitizeAnthropicId(toolCall.id),
      name: String(toolCall.function?.name ?? 'tool'),
      input: parseToolArguments(toolCall.function?.arguments),
    });
  }
  return {
    id: typeof response.id === 'string' ? response.id.replace(/^chatcmpl/, 'msg') : `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: blocks.length > 0 ? blocks : [{ type: 'text', text: '' }],
    model: response.model ?? fallbackModel,
    stop_reason: mapStopReason(choice.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: response.usage?.completion_tokens ?? 0,
    },
  };
}

export function mapStopReason(reason: unknown): string {
  if (reason === 'length') return 'max_tokens';
  if (reason === 'tool_calls' || reason === 'function_call') return 'tool_use';
  if (reason === 'content_filter') return 'refusal';
  return 'end_turn';
}

function contentFromOpenAI(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (isRecord(part) && part.type === 'text') return String(part.text ?? '');
      if (isRecord(part) && typeof part.text === 'string') return part.text;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function parseToolArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
