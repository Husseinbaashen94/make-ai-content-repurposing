import { describe, expect, it } from 'vitest';
import { renderPreview, type DemoResult } from '../../src/preview.js';

const ok: DemoResult = {
  id: 'a',
  article: { title: 'Scheduled <reports>', url: 'https://x.example/a', published_at: '2026-11-18T09:00:00Z', author: 'Team', html: '' },
  excerpt: 'You can now send <b>any</b> dashboard',
  drafts: {
    linkedin_post: 'LinkedIn text',
    x_thread: ['first post', 'second post'],
    newsletter_blurb: 'Blurb',
    hashtags: ['#Analytics'],
    confidence: 0.9,
  },
  validation: { valid: true, problems: [] },
};
const bad: DemoResult = {
  ...ok,
  id: 'b',
  article: { ...ok.article, title: 'Faster dashboards' },
  validation: { valid: false, problems: ['number not in the article: 300'] },
};
const html = renderPreview([ok, bad]);

describe('renderPreview', () => {
  it('is a complete standalone page with a summary', () => {
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('1 ready for approval, 1 sent back to the marketer');
  });

  it('shows every article and every draft', () => {
    for (const text of ['Faster dashboards', 'LinkedIn text', 'first post', 'second post', 'Blurb', '#Analytics']) expect(html).toContain(text);
  });

  it('shows character counts against the limits', () => {
    expect(html).toContain('13 / 3,000');
    expect(html).toContain('10 / 280');
    expect(html).toContain('5 / 600');
  });

  it('marks invalid results with their problems', () => {
    expect(html).toMatch(/class="card invalid"/);
    expect(html).toContain('number not in the article: 300');
  });

  it('escapes article content', () => {
    expect(html).toContain('Scheduled &lt;reports&gt;');
    expect(html).toContain('send &lt;b&gt;any&lt;/b&gt; dashboard');
  });

  it('lets the browser lay out right-to-left text', () => {
    expect(html).toContain('dir="auto"');
  });
});
