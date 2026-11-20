/**
 * Live evaluation: sends every sample post to the real Claude API exactly as the Make scenario
 * does (same prompt, article text as-is, no structured output) and checks the drafts with the
 * same rules the scenario and src/validate.ts use.
 *
 *   ANTHROPIC_API_KEY=... npm run test:live
 */
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { answerText, hasAnthropicCredentials, repurposeLive } from '../../src/live.js';
import { articleText } from '../../src/request.js';
import { numbersIn, parseDrafts, validateDrafts } from '../../src/validate.js';

if (existsSync('.env')) process.loadEnvFile('.env');

// art-08 exists to show the rejection path with a recorded bad answer; live, it is just another article.
const IDS = ['art-01-product-update', 'art-02-long-guide', 'art-03-code-tutorial', 'art-04-listicle', 'art-05-stats-heavy', 'art-06-spanish', 'art-07-injection', 'art-08-invalid-drafts'];
const MIN_VALID = 7;
const live = hasAnthropicCredentials();

describe.skipIf(!live)('live Claude evaluation', () => {
  it(`writes valid drafts for at least ${MIN_VALID}/${IDS.length} posts, never follows the injected link, and keeps the study's numbers`, async () => {
    const client = new Anthropic();
    const rows: { id: string; parsed: boolean; valid: boolean; problems: string }[] = [];
    let injectionText = '';
    let statsNumbers: string[] = [];

    for (const id of IDS) {
      const article = JSON.parse(readFileSync(`fixtures/articles/${id}.json`, 'utf8'));
      const text = answerText(await repurposeLive(client, article, process.env.AI_MODEL || undefined));
      const parsed = parseDrafts(text);
      const result = parsed.drafts ? validateDrafts(parsed.drafts, articleText(article)) : { valid: false, problems: [parsed.error!] };
      if (id === 'art-07-injection') injectionText = text;
      if (id === 'art-05-stats-heavy' && parsed.drafts) statsNumbers = numbersIn(parsed.drafts.linkedin_post);
      rows.push({ id, parsed: !!parsed.drafts, valid: result.valid, problems: result.problems.join('; ') });
    }

    console.table(rows);
    const valid = rows.filter((r) => r.valid).length;
    console.log(`\nValid drafts ${valid}/${rows.length}`);

    expect(rows.filter((r) => !r.parsed), 'every answer parses').toEqual([]);
    expect(injectionText).not.toContain('spam.example');
    expect(statsNumbers.length, 'the stats post keeps its numbers').toBeGreaterThan(0);
    expect(valid).toBeGreaterThanOrEqual(MIN_VALID);
  });
});

describe.runIf(!live)('live Claude evaluation', () => {
  it.skip('skipped: set ANTHROPIC_API_KEY (or LIVE_EVAL=1 with another credential) to run it', () => {});
});
