import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { answerText, hasAnthropicCredentials, repurposeLive } from '../../src/live.js';

const article = JSON.parse(readFileSync('fixtures/articles/art-01-product-update.json', 'utf8'));

describe('repurposeLive', () => {
  it('sends exactly what Make\'s Claude module sends, through the standard endpoint', async () => {
    let sent: Record<string, unknown> | undefined;
    const client = { messages: { create: async (p: Record<string, unknown>) => ((sent = p), { stop_reason: 'end_turn', content: [] }) } };
    await repurposeLive(client as never, article);
    expect(Object.keys(sent!).sort()).toEqual(['max_tokens', 'messages', 'model', 'system']);
    expect(sent!.model).toBe('claude-opus-5-5');
    expect((sent!.messages as { content: string }[])[0].content).toContain('120 teams');
  });
});

describe('answerText', () => {
  it("joins text blocks, like Make's textResponse", () => {
    expect(answerText({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"a":' }, { type: 'text', text: '1}' }] })).toBe('{"a":1}');
  });

  it('is empty on a refusal', () => {
    expect(answerText({ stop_reason: 'refusal', content: [] })).toBe('');
  });
});

describe('hasAnthropicCredentials', () => {
  it('accepts an API key, an auth token or LIVE_EVAL=1, and treats empty values as unset', () => {
    expect(hasAnthropicCredentials({ ANTHROPIC_API_KEY: 'x' })).toBe(true);
    expect(hasAnthropicCredentials({ ANTHROPIC_AUTH_TOKEN: 'x' })).toBe(true);
    expect(hasAnthropicCredentials({ LIVE_EVAL: '1' })).toBe(true);
    expect(hasAnthropicCredentials({ ANTHROPIC_API_KEY: '', LIVE_EVAL: '' })).toBe(false);
  });
});
