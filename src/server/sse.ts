import { ServerResponse } from 'node:http';
import { mapStopReason } from './translate.js';

export function writeSseHeaders(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
}

function writeSseEvent(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function completeSseFrames(buffer: string): { frames: string[]; rest: string } {
  const frames: string[] = [];
  const separator = /\r?\n\r?\n/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = separator.exec(buffer))) {
    frames.push(buffer.slice(cursor, match.index));
    cursor = separator.lastIndex;
  }
  return { frames, rest: buffer.slice(cursor) };
}

interface OpenAIToolStreamState {
  blockIndex: number;
  id: string;
  name: string;
  started: boolean;
  bufferedArguments: string;
}

export async function pipeWebStreamToNode(stream: ReadableStream<Uint8Array> | null, res: ServerResponse): Promise<void> {
  res.flushHeaders();
  if (!stream) {
    res.end();
    return;
  }
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    res.end();
    reader.releaseLock();
  }
}

export async function pipeOpenAIStreamAsAnthropic(stream: ReadableStream<Uint8Array> | null, res: ServerResponse, model: string): Promise<void> {
  writeSseHeaders(res);
  writeSseEvent(res, 'message_start', { type: 'message_start', message: { id: `msg_${Date.now()}`, type: 'message', role: 'assistant', content: [], model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } });
  if (!stream) {
    writeSseEvent(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    writeSseEvent(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
    writeSseEvent(res, 'message_stop', { type: 'message_stop' });
    res.end();
    return;
  }
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = '';
  let usedTool = false;
  let nextBlockIndex = 0;
  let textBlockIndex: number | undefined;
  let textBlockOpen = false;
  let finishReason: unknown;
  let outputTokens = 0;
  const toolBlocks = new Map<number, OpenAIToolStreamState>();
  const ensureTextBlock = (): number => {
    if (!textBlockOpen) {
      textBlockIndex = nextBlockIndex;
      nextBlockIndex += 1;
      writeSseEvent(res, 'content_block_start', { type: 'content_block_start', index: textBlockIndex, content_block: { type: 'text', text: '' } });
      textBlockOpen = true;
    }
    return textBlockIndex!;
  };
  const stopTextBlock = () => {
    if (textBlockOpen && textBlockIndex !== undefined) {
      writeSseEvent(res, 'content_block_stop', { type: 'content_block_stop', index: textBlockIndex });
      textBlockOpen = false;
      textBlockIndex = undefined;
    }
  };
  const ensureToolBlock = (toolIndex: number, delta: { id?: string; function?: { name?: string } }): OpenAIToolStreamState => {
    let state = toolBlocks.get(toolIndex);
    if (!state) {
      state = {
        blockIndex: nextBlockIndex,
        id: delta.id ?? `toolu_${Date.now()}_${toolIndex}`,
        name: delta.function?.name ?? '',
        started: false,
        bufferedArguments: '',
      };
      nextBlockIndex += 1;
      toolBlocks.set(toolIndex, state);
    }
    if (delta.id) state.id = delta.id;
    if (delta.function?.name) state.name = delta.function.name;
    if (!state.started && state.name) {
      stopTextBlock();
      writeSseEvent(res, 'content_block_start', { type: 'content_block_start', index: state.blockIndex, content_block: { type: 'tool_use', id: state.id, name: state.name, input: {} } });
      state.started = true;
      usedTool = true;
      if (state.bufferedArguments) {
        writeSseEvent(res, 'content_block_delta', { type: 'content_block_delta', index: state.blockIndex, delta: { type: 'input_json_delta', partial_json: state.bufferedArguments } });
        state.bufferedArguments = '';
      }
    }
    return state;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const completed = completeSseFrames(buffer);
      buffer = completed.rest;
      for (const part of completed.frames) {
        for (const line of part.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          if (!data.startsWith('{')) continue;
          try {
            const chunk = JSON.parse(data) as { usage?: { completion_tokens?: number; output_tokens?: number }; choices?: Array<{ finish_reason?: unknown; delta?: { content?: string; function_call?: { name?: string; arguments?: string }; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> } }> };
            const choice = chunk.choices?.[0];
            const delta = choice?.delta;
            if (choice?.finish_reason) finishReason = choice.finish_reason;
            if (typeof chunk.usage?.completion_tokens === 'number') outputTokens = chunk.usage.completion_tokens;
            if (typeof chunk.usage?.output_tokens === 'number') outputTokens = chunk.usage.output_tokens;
            const text = delta?.content;
            if (text) {
              writeSseEvent(res, 'content_block_delta', { type: 'content_block_delta', index: ensureTextBlock(), delta: { type: 'text_delta', text } });
            }
            for (const toolCall of delta?.tool_calls ?? []) {
              const toolIndex = typeof toolCall.index === 'number' ? toolCall.index : 0;
              const state = ensureToolBlock(toolIndex, toolCall);
              const partialJson = toolCall.function?.arguments;
              if (partialJson) {
                if (state.started) {
                  writeSseEvent(res, 'content_block_delta', { type: 'content_block_delta', index: state.blockIndex, delta: { type: 'input_json_delta', partial_json: partialJson } });
                } else {
                  state.bufferedArguments += partialJson;
                }
              }
            }
            if (delta?.function_call) {
              const state = ensureToolBlock(0, { function: { name: delta.function_call.name } });
              const partialJson = delta.function_call.arguments;
              if (partialJson) {
                if (state.started) {
                  writeSseEvent(res, 'content_block_delta', { type: 'content_block_delta', index: state.blockIndex, delta: { type: 'input_json_delta', partial_json: partialJson } });
                } else {
                  state.bufferedArguments += partialJson;
                }
              }
            }
          } catch {
            // Ignore keepalive or malformed upstream comments.
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (!textBlockOpen && toolBlocks.size === 0) ensureTextBlock();
  stopTextBlock();
  for (const state of toolBlocks.values()) {
    if (!state.started) {
      writeSseEvent(res, 'content_block_start', { type: 'content_block_start', index: state.blockIndex, content_block: { type: 'tool_use', id: state.id, name: state.name || 'tool', input: {} } });
      if (state.bufferedArguments) writeSseEvent(res, 'content_block_delta', { type: 'content_block_delta', index: state.blockIndex, delta: { type: 'input_json_delta', partial_json: state.bufferedArguments } });
      state.started = true;
      usedTool = true;
    }
    if (state.started) writeSseEvent(res, 'content_block_stop', { type: 'content_block_stop', index: state.blockIndex });
  }
  writeSseEvent(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: usedTool ? 'tool_use' : mapStopReason(finishReason), stop_sequence: null }, usage: { output_tokens: outputTokens } });
  writeSseEvent(res, 'message_stop', { type: 'message_stop' });
  res.end();
}
