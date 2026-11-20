/**
 * Calls the real Claude API exactly as the Make scenario does. Used only by the live evaluation
 * (npm run test:live) and npm run record. In Make, the Anthropic Claude module makes this call.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { buildMakeStyleRequest } from './request.js';
import type { Article } from './types.js';

/** True when the SDK has something to authenticate with. Empty .env values count as unset. */
export function hasAnthropicCredentials(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.LIVE_EVAL === '1');
}

/** Repurposes one article with the live API, sending exactly what Make's Claude module sends. */
export async function repurposeLive(client: Anthropic, article: Article, model?: string): Promise<unknown> {
  const { body } = buildMakeStyleRequest(article, { model });
  return client.messages.create(body as unknown as Parameters<Anthropic['messages']['create']>[0]);
}

/** The reply text, as Make's "textResponse" output provides it. Empty on refusal. */
export function answerText(response: unknown): string {
  const r = response as { stop_reason?: string; content?: { type: string; text?: string }[] };
  if (r?.stop_reason === 'refusal') return '';
  return (r?.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
}
