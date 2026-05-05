import { describe, expect, it } from 'vitest';
import { anthropicToOpenAI, extractTextContent, openAIToAnthropic } from '../src/server/translate.js';

describe('Anthropic/OpenAI translation fallback', () => {
  it('converts text messages and system prompt to OpenAI chat', () => {
    expect(anthropicToOpenAI({ system: 'sys', max_tokens: 10, messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] }, 'm')).toMatchObject({
      model: 'm',
      max_tokens: 10,
      messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
    });
  });

  it('converts Anthropic tools and tool history to OpenAI tool calls', () => {
    const out = anthropicToOpenAI({
      tools: [{ name: 'Bash', description: 'Run shell', input_schema: { type: 'object', properties: { command: { type: 'string' } } } }],
      tool_choice: { type: 'auto' },
      messages: [
        { role: 'assistant', content: [{ type: 'text', text: 'checking' }, { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'text', text: 'README.md' }] }] },
      ],
    }, 'm');
    expect(out.tools?.[0]).toMatchObject({ type: 'function', function: { name: 'Bash', parameters: { type: 'object' } } });
    expect(out.tool_choice).toBe('auto');
    expect(out.messages).toMatchObject([
      { role: 'assistant', content: 'checking', tool_calls: [{ id: 'toolu_1', function: { name: 'Bash', arguments: '{"command":"ls"}' } }] },
      { role: 'tool', tool_call_id: 'toolu_1', content: 'README.md' },
    ]);
  });

  it('preserves tool results before follow-up user text for OpenAI history', () => {
    const out = anthropicToOpenAI({
      messages: [
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call:1', content: 'done' }, { type: 'text', text: 'continue' }] },
      ],
    }, 'm');
    expect(out.messages).toEqual([
      { role: 'tool', tool_call_id: 'call_1', content: 'done' },
      { role: 'user', content: 'continue' },
    ]);
  });

  it('maps Anthropic image blocks to OpenAI image_url content', () => {
    const out = anthropicToOpenAI({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } }] }],
    }, 'm');
    expect(out.messages?.[0]).toMatchObject({
      role: 'user',
      content: [
        { type: 'text', text: 'look' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
      ],
    });
  });

  it('maps Anthropic tool choice none and disables parallel tool calls', () => {
    expect(anthropicToOpenAI({ tool_choice: { type: 'none', disable_parallel_tool_use: true } }, 'm')).toMatchObject({
      tool_choice: 'none',
      parallel_tool_calls: false,
    });
  });

  it('rejects unsupported non-text blocks', () => {
    expect(() => extractTextContent([{ type: 'image', source: {} }])).toThrow(/Unsupported/);
  });

  it('maps OpenAI completion into Anthropic message shape', () => {
    const out = openAIToAnthropic({ id: 'chatcmpl_1', model: 'm', choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 3 } }, 'm');
    expect(out).toMatchObject({ type: 'message', role: 'assistant', content: [{ type: 'text', text: 'hello' }], usage: { input_tokens: 2, output_tokens: 3 } });
  });

  it('maps OpenAI tool calls into Anthropic tool_use blocks', () => {
    const out = openAIToAnthropic({
      id: 'chatcmpl_1',
      model: 'm',
      choices: [{ message: { tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'Bash', arguments: '{"command":"ls"}' } }] }, finish_reason: 'tool_calls' }],
    }, 'm');
    expect(out).toMatchObject({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'call_1', name: 'Bash', input: { command: 'ls' } }] });
  });

  it('maps legacy OpenAI function calls into Anthropic tool_use blocks', () => {
    const out = openAIToAnthropic({
      choices: [{ message: { function_call: { name: 'Bash', arguments: '{"command":"pwd"}' } }, finish_reason: 'function_call' }],
    }, 'm');
    expect(out).toMatchObject({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'pwd' } }] });
  });
});
