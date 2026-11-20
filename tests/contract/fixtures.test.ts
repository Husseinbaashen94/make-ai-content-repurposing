import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ArticleSchema, DraftsSchema } from '../../src/types.js';

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const ids = readdirSync('fixtures/articles').map((f) => f.replace(/\.json$/, ''));
const expected: Record<string, { valid: boolean; problems: string[] }> = readJson('fixtures/expected.json');

describe('fixture contract', () => {
  it('has 8 sample articles', () => {
    expect(ids).toHaveLength(8);
  });

  it.each(ids)('%s is a valid article', (id) => {
    const parsed = ArticleSchema.safeParse(readJson(`fixtures/articles/${id}.json`));
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
  });

  it.each(ids)('%s has a recorded answer that parses into the drafts shape', (id) => {
    const recorded = readJson(`fixtures/recorded/${id}.json`);
    const json = recorded.text.replace(/```(?:json)?/g, '');
    const parsed = DraftsSchema.safeParse(JSON.parse(json.slice(json.indexOf('{'), json.lastIndexOf('}') + 1)));
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
  });

  it('expected.json covers exactly the fixtures, with a reason for every invalid one', () => {
    expect(Object.keys(expected).sort()).toEqual([...ids].sort());
    for (const { valid, problems } of Object.values(expected)) expect(valid).toBe(problems.length === 0);
  });

  it('the long guide is longer than the 15,000-character prompt cap', () => {
    expect(readJson('fixtures/articles/art-02-long-guide.json').html.length).toBeGreaterThan(15_000);
  });
});

describe('drafts schema', () => {
  const schema = readJson('schemas/drafts.schema.json');

  it('is closed and requires all five fields', () => {
    expect(schema.additionalProperties).toBe(false);
    expect([...schema.required].sort()).toEqual(['confidence', 'hashtags', 'linkedin_post', 'newsletter_blurb', 'x_thread']);
  });
});
