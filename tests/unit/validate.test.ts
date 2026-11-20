import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { articleText } from '../../src/request.js';
import { LIMITS, parseDrafts, validateDrafts } from '../../src/validate.js';
import type { Drafts } from '../../src/types.js';

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const expected: Record<string, { valid: boolean; problems: string[] }> = readJson('fixtures/expected.json');

const SOURCE = 'We analysed 2,400 retailers over 18 months. Stores had 37% fewer stock-outs and lost 4.2% of revenue. It took 1000 hours.';
const good: Drafts = {
  linkedin_post: 'We analysed 2,400 retailers over 18 months.',
  x_thread: ['Stores had 37% fewer stock-outs.', 'The median store lost 4.2% of revenue.'],
  newsletter_blurb: 'A study of 2,400 retailers.',
  hashtags: ['#Retail', '#Inventory'],
  confidence: 0.9,
};
const problemsOf = (patch: Partial<Drafts>) => validateDrafts({ ...good, ...patch }, SOURCE).problems;

describe('every recorded fixture', () => {
  it.each(Object.keys(expected))('%s validates as expected', (id) => {
    const article = readJson(`fixtures/articles/${id}.json`);
    const parsed = parseDrafts(readJson(`fixtures/recorded/${id}.json`).text);
    expect(parsed.error).toBeUndefined();
    expect(validateDrafts(parsed.drafts!, articleText(article))).toEqual(expected[id]);
  });

  it('the injection article drafts never contain the injected link', () => {
    expect(readJson('fixtures/recorded/art-07-injection.json').text).not.toContain('spam.example');
  });
});

describe('platform limits (the Make route filter uses the same numbers)', () => {
  it('exposes the limits', () => {
    expect(LIMITS).toEqual({ xPost: 280, xPostsMin: 2, xPostsMax: 5, linkedin: 3000, newsletter: 600, hashtagsMin: 1, hashtagsMax: 5, articleChars: 15000 });
  });

  it('accepts a clean set of drafts', () => {
    expect(validateDrafts(good, SOURCE)).toEqual({ valid: true, problems: [] });
  });

  it('X posts: 280 ok, 281 fails', () => {
    expect(problemsOf({ x_thread: ['a'.repeat(280), 'b'] })).toEqual([]);
    expect(problemsOf({ x_thread: ['a', 'b'.repeat(281)] })).toEqual(['x_thread post 2 is 281 characters (max 280)']);
  });

  it('counts each accented letter or emoji as one character (Unicode code points)', () => {
    expect(problemsOf({ x_thread: ['é'.repeat(280), '📈'.repeat(280)] })).toEqual([]);
  });

  it('X thread: 2 to 5 posts', () => {
    expect(problemsOf({ x_thread: ['only one'] })).toEqual(['x_thread has 1 posts (need 2-5)']);
    expect(problemsOf({ x_thread: ['a', 'b', 'c', 'd', 'e', 'f'] })).toEqual(['x_thread has 6 posts (need 2-5)']);
  });

  it('LinkedIn: 3000 ok, 3001 fails', () => {
    expect(problemsOf({ linkedin_post: 'a'.repeat(3000) })).toEqual([]);
    expect(problemsOf({ linkedin_post: 'a'.repeat(3001) })).toEqual(['linkedin_post is 3001 characters (max 3000)']);
  });

  it('newsletter: 600 ok, 601 fails', () => {
    expect(problemsOf({ newsletter_blurb: 'a'.repeat(600) })).toEqual([]);
    expect(problemsOf({ newsletter_blurb: 'a'.repeat(601) })).toEqual(['newsletter_blurb is 601 characters (max 600)']);
  });

  it('flags empty drafts', () => {
    expect(problemsOf({ linkedin_post: '  ', x_thread: ['a', ''] })).toEqual(['empty linkedin_post', 'x_thread post 2 is empty']);
  });

  it('hashtags: 1 to 5, distinct (case-insensitive), each a single #word', () => {
    expect(problemsOf({ hashtags: [] })).toEqual(['hashtags: 0 (need 1-5)']);
    expect(problemsOf({ hashtags: ['#a', '#b', '#c', '#d', '#e', '#f'] })).toEqual(['hashtags: 6 (need 1-5)']);
    expect(problemsOf({ hashtags: ['#AI', '#ai'] })).toEqual(['duplicate hashtag #ai']);
    expect(problemsOf({ hashtags: ['#two words'] })).toEqual(['hashtag "#two words" is not a single #word']);
    expect(problemsOf({ hashtags: ['NoHash'] })).toEqual(['hashtag "NoHash" is not a single #word']);
    expect(problemsOf({ hashtags: ['#Márgenes'] })).toEqual([]);
  });
});

describe('no invented numbers', () => {
  it('flags a number that is not in the article', () => {
    expect(problemsOf({ linkedin_post: 'Revenue grew 300%.' })).toEqual(['number not in the article: 300']);
  });

  it('matches numbers however their thousands are written (2,400 = 2400; 1000 = 1,000)', () => {
    expect(problemsOf({ linkedin_post: '2400 retailers and 1,000 hours.' })).toEqual([]);
  });

  it('keeps decimals exact (4.2 is in the article, 4.5 is not)', () => {
    expect(problemsOf({ linkedin_post: 'Lost 4.5% of revenue.' })).toEqual(['number not in the article: 4.5']);
  });

  it('checks every draft, reporting each invented number once', () => {
    expect(problemsOf({ x_thread: ['Up 99%.', 'Again 99%.'], newsletter_blurb: '12 new tips' })).toEqual([
      'number not in the article: 99',
      'number not in the article: 12',
    ]);
  });

  it('ignores digits inside hashtags and URLs', () => {
    expect(problemsOf({ hashtags: ['#Web3'], linkedin_post: 'Read more: https://example.com/post-77' })).toEqual([]);
  });
});

describe('parseDrafts', () => {
  const json = JSON.stringify(good);

  it('accepts a fenced block and leading or trailing prose', () => {
    expect(parseDrafts('```json\n' + json + '\n```').drafts).toEqual(good);
    expect(parseDrafts('Here you go:\n' + json + '\nEnjoy!').drafts).toEqual(good);
  });

  it.each(['', 'null', '[]', 'Sorry, I cannot help.', '{"linkedin_post": "x"', '{"linkedin_post": 5}'])('never throws on %j and explains why', (text) => {
    const result = parseDrafts(text);
    expect(result.drafts).toBeUndefined();
    expect(result.error).toMatch(/not valid JSON|wrong shape/);
  });
});
