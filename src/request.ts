import { readFileSync } from 'node:fs';
import type { Article } from './types.js';
import { LIMITS } from './validate.js';

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const ANTHROPIC_HEADERS = {
  'anthropic-version': '2023-06-01',
  // Retries a rare policy refusal on a fallback model inside the same call.
  'anthropic-beta': 'server-side-fallback-2026-07-01',
  'content-type': 'application/json',
} as const;

const PROMPT = readFileSync(new URL('../prompts/repurpose.md', import.meta.url), 'utf8').trim();
const BRAND_VOICE = readFileSync(new URL('../config/brand-voice.md', import.meta.url), 'utf8').trim();
const DRAFTS_SCHEMA = JSON.parse(readFileSync(new URL('../schemas/drafts.schema.json', import.meta.url), 'utf8')) as Record<string, unknown>;

export function renderSystemPrompt(brandVoice: string = BRAND_VOICE): string {
  const fill: Record<string, string> = {
    BRAND_VOICE: brandVoice.trim(),
    LINKEDIN: LIMITS.linkedin.toLocaleString('en-US'),
    X_MIN: String(LIMITS.xPostsMin),
    X_MAX: String(LIMITS.xPostsMax),
    X_POST: String(LIMITS.xPost),
    NEWSLETTER: String(LIMITS.newsletter),
    TAGS_MIN: String(LIMITS.hashtagsMin),
    TAGS_MAX: String(LIMITS.hashtagsMax),
  };
  return PROMPT.replace(/\{\{(\w+)\}\}/g, (_, key: string) => fill[key] ?? `{{${key}}}`);
}

/** The article page reduced to readable text (Make's "HTML to text" step does the same job). */
export function articleText(article: Article): string {
  return article.html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|h\d|li|pre|div|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function layout(article: Article, text: string): string {
  return [
    'Write social and newsletter drafts for this blog post.',
    '',
    '<article>',
    `title: ${article.title}`,
    `url: ${article.url}`,
    `author: ${article.author}`,
    `published: ${article.published_at}`,
    '',
    'text:',
    text,
    '</article>',
  ].join('\n');
}

const truncate = (text: string) =>
  [...text].length > LIMITS.articleChars ? [...text].slice(0, LIMITS.articleChars).join('') + '\n[truncated]' : text;

/** The article text Claude actually sees: cut at LIMITS.articleChars (without the marker). */
export const promptText = (article: Article): string => [...articleText(article)].slice(0, LIMITS.articleChars).join('');

const escapeTags = (text: string) => text.replace(/<(\/?)article>/gi, '&lt;$1article&gt;');

/** User message built by this repo: article text escaped and cut at LIMITS.articleChars. */
export function renderUserContent(article: Article): string {
  return layout({ ...article, title: escapeTags(article.title) }, escapeTags(truncate(articleText(article))));
}

export interface RepurposeRequest {
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

const baseBody = (article: Article, model: string | undefined, content: string) => ({
  model: model || DEFAULT_MODEL,
  max_tokens: 16000,
  system: renderSystemPrompt(),
  messages: [{ role: 'user', content }],
});

/** Request with structured output (schema-constrained JSON). Useful outside Make. */
export function buildRepurposeRequest(article: Article, opts: { model?: string } = {}): RepurposeRequest {
  return {
    headers: { ...ANTHROPIC_HEADERS },
    body: {
      ...baseBody(article, opts.model, renderUserContent(article)),
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: structuredClone(DRAFTS_SCHEMA) } },
      fallbacks: 'default',
    },
  };
}

/**
 * Exactly what scenario 1 sends through Make's Anthropic Claude module: model, max_tokens, system
 * and the user message (article text inserted as-is, cut at LIMITS.articleChars). The module can't
 * set effort, structured output or the refusal fallback, so this request doesn't either. The live
 * evaluation uses it, so its results describe the real scenario.
 */
export function buildMakeStyleRequest(article: Article, opts: { model?: string } = {}): RepurposeRequest {
  return {
    headers: { 'anthropic-version': ANTHROPIC_HEADERS['anthropic-version'], 'content-type': 'application/json' },
    body: baseBody(article, opts.model, layout(article, truncate(articleText(article)))),
  };
}
