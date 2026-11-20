/**
 * The 2-minute demo: runs every sample blog post through Claude's recorded answer and the same
 * validation rules as the Make scenario, then writes a side-by-side preview.
 * Needs no Make account, no API key and no .env.
 *
 *   npm run demo   ->  out/preview.html
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { renderPreview, type DemoResult } from '../src/preview.js';
import { articleText, promptText } from '../src/request.js';
import { parseDrafts, validateDrafts } from '../src/validate.js';

const results: DemoResult[] = [];
for (const file of readdirSync('fixtures/articles').sort()) {
  const id = file.replace(/\.json$/, '');
  const article = JSON.parse(readFileSync(`fixtures/articles/${file}`, 'utf8'));
  const recorded = JSON.parse(readFileSync(`fixtures/recorded/${file}`, 'utf8'));
  const text = articleText(article);
  const parsed = parseDrafts(recorded.text);
  const validation = parsed.drafts ? validateDrafts(parsed.drafts, promptText(article)) : { valid: false, problems: [parsed.error!] };
  results.push({ id, article, excerpt: text.length > 420 ? text.slice(0, 420) + '…' : text, drafts: parsed.drafts, validation });
}

mkdirSync('out', { recursive: true });
writeFileSync('out/preview.html', renderPreview(results));

const ready = results.filter((r) => r.validation.valid).length;
console.log(`${ready} ready for approval, ${results.length - ready} sent back to the marketer\n`);
for (const r of results) {
  const mark = r.validation.valid ? 'READY ' : 'BACK  ';
  const why = r.validation.problems.length ? `  (${r.validation.problems.join('; ')})` : '';
  console.log(`${mark} ${r.article.title}${why}`);
}
console.log('\nWrote out/preview.html (open it in a browser).');
