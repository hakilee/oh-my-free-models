export interface AnthropicMessageRequest {
  model?: string;
  system?: string | Array<{ type?: string; text?: string }>;
  messages?: Array<{ role: 'user' | 'assistant'; content: string | Array<Record<string, unknown>> }>;
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
  messages?: Array<{ role: string; content: string }>;
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

function systemToText(system: AnthropicMessageRequest['system']): string | undefined {
  if (!system) return undefined;
  if (typeof system === 'string') return system;
  return system.map((block) => block.text ?? '').filter(Boolean).join('\n') || undefined;
}

export function anthropicToOpenAI(body: AnthropicMessageRequest, modelId: string): OpenAIChatRequest {
  const messages: Array<{ role: string; content: string }> = [];
  const system = systemToText(body.system);
  if (system) messages.push({ role: 'system', content: system });
  for (const message of body.messages ?? []) {
    messages.push({ role: message.role, content: extractTextContent(message.content) });
  }
  return {
    model: modelId,
    messages,
    max_tokens: body.max_tokens,
    temperature: body.temperature,
    top_p: body.top_p,
    stop: body.stop ?? body.stop_sequences,
    stream: body.stream,
  };
}

export function openAIToAnthropic(response: Record<string, any>, fallbackModel: string): Record<string, unknown> {
  const choice = response.choices?.[0] ?? {};
  const content = choice.message?.content ?? choice.text ?? '';
  return {
    id: typeof response.id === 'string' ? response.id.replace(/^chatcmpl/, 'msg') : `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: String(content ?? '') }],
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
  if (reason === 'tool_calls') return 'tool_use';
  return 'end_turn';
}
