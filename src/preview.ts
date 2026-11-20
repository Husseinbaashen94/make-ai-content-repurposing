/** Side-by-side HTML preview: each article next to the drafts Claude wrote for it. */
import type { Article, Drafts } from './types.js';
import { LIMITS } from './validate.js';

export interface DemoResult {
  id: string;
  article: Article;
  excerpt: string;
  drafts?: Drafts;
  validation: { valid: boolean; problems: string[] };
}

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const chars = (text: string) => [...text].length;

function count(text: string, limit: number): string {
  const n = chars(text);
  return `<span class="count${n > limit ? ' over' : ''}">${n} / ${limit.toLocaleString('en-US')}</span>`;
}

function draftsHtml(d: Drafts): string {
  const thread = d.x_thread
    .map((post, i) => `<li><div dir="auto">${escapeHtml(post)}</div>${count(post, LIMITS.xPost)}</li>`)
    .join('');
  return `
    <h3>LinkedIn ${count(d.linkedin_post, LIMITS.linkedin)}</h3>
    <div class="draft" dir="auto">${escapeHtml(d.linkedin_post)}</div>
    <h3>X thread (${d.x_thread.length} posts)</h3>
    <ol class="thread">${thread}</ol>
    <h3>Newsletter ${count(d.newsletter_blurb, LIMITS.newsletter)}</h3>
    <div class="draft" dir="auto">${escapeHtml(d.newsletter_blurb)}</div>
    <p class="tags">${d.hashtags.map((t) => `<span>${escapeHtml(t)}</span>`).join(' ')}</p>`;
}

function card(r: DemoResult): string {
  const status = r.validation.valid
    ? '<p class="status ok">Ready for approval</p>'
    : `<div class="status bad"><strong>Sent back to the marketer:</strong><ul>${r.validation.problems
        .map((p) => `<li>${escapeHtml(p)}</li>`)
        .join('')}</ul></div>`;
  return `<section class="card ${r.validation.valid ? 'valid' : 'invalid'}">
  <div class="source">
    <p class="label">Blog post</p>
    <h2 dir="auto">${escapeHtml(r.article.title)}</h2>
    <p class="meta">${escapeHtml(r.article.author)} · ${escapeHtml(r.article.published_at.slice(0, 10))}</p>
    <p class="excerpt" dir="auto">${escapeHtml(r.excerpt)}</p>
  </div>
  <div class="drafts">
    <p class="label">Drafts by Claude</p>
    ${status}
    ${r.drafts ? draftsHtml(r.drafts) : ''}
  </div>
</section>`;
}

export function renderPreview(results: DemoResult[]): string {
  const ready = results.filter((r) => r.validation.valid).length;
  const back = results.length - ready;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Content repurposing demo</title>
<style>
  :root { --bg: #f6f7fb; --card: #fff; --text: #1f2328; --muted: #57606a; --line: #d8dee4; --ok: #1a7f37; --bad: #cf222e; --accent: #6d00cc; }
  body { margin: 0; font: 14px/1.5 system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); }
  header { padding: 20px 24px; background: var(--card); border-bottom: 1px solid var(--line); }
  header h1 { margin: 0 0 4px; font-size: 20px; }
  header p { margin: 0; color: var(--muted); }
  main { padding: 16px 24px 32px; display: grid; gap: 16px; }
  .card { display: grid; grid-template-columns: minmax(240px, 1fr) 2fr; background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .card.invalid { border-color: var(--bad); }
  .source { padding: 16px; background: #fafbfc; border-right: 1px solid var(--line); }
  .drafts { padding: 16px; }
  .label { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  h2 { margin: 0 0 4px; font-size: 16px; }
  h3 { margin: 14px 0 6px; font-size: 13px; display: flex; gap: 8px; align-items: baseline; }
  .meta { margin: 0 0 8px; color: var(--muted); font-size: 12px; }
  .excerpt { margin: 0; color: var(--muted); white-space: pre-wrap; }
  .draft { white-space: pre-wrap; background: #f6f8fa; border-radius: 6px; padding: 8px 10px; }
  .thread { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
  .thread li div { white-space: pre-wrap; }
  .count { font-weight: 400; font-size: 11px; color: var(--muted); }
  .count.over { color: var(--bad); font-weight: 600; }
  .tags span { display: inline-block; margin: 2px 4px 0 0; padding: 1px 8px; border-radius: 999px; background: #f0e6fb; color: var(--accent); font-size: 12px; }
  .status { margin: 0 0 4px; font-weight: 600; }
  .status.ok { color: var(--ok); }
  .status.bad { color: var(--bad); background: #fff0f0; border-radius: 6px; padding: 6px 10px; }
  .status.bad ul { margin: 4px 0 0; padding-left: 18px; font-weight: 400; }
  @media (max-width: 760px) { .card { grid-template-columns: 1fr; } .source { border-right: 0; border-bottom: 1px solid var(--line); } }
</style>
</head>
<body>
<header>
  <h1>One blog post in, a week of content out (Make.com and Claude)</h1>
  <p>${results.length} sample blog posts: ${ready} ready for approval, ${back} sent back to the marketer.</p>
</header>
<main>
${results.map(card).join('\n')}
</main>
</body>
</html>
`;
}
