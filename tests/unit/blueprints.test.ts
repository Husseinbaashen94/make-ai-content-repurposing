import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBlueprints, BLUEPRINT_FILES } from '../../scripts/build-blueprints.js';
import { renderSystemPrompt } from '../../src/request.js';
import { LIMITS } from '../../src/validate.js';

type Mod = {
  id: number;
  module: string;
  version: number;
  parameters?: Record<string, unknown> | null;
  mapper?: Record<string, any> | null;
  filter?: { name: string; conditions: { a: string; b?: string; o: string }[][] };
  routes?: { flow: Mod[] }[];
  onerror?: Mod[];
  metadata?: { designer?: { x: number; y: number } };
};
type Blueprint = { name: string; flow: Mod[]; metadata: { scenario: Record<string, unknown> } };

const known: { modules: { module: string; version: number }[] } = JSON.parse(readFileSync('make/known-modules.json', 'utf8'));
const built = buildBlueprints() as Record<string, Blueprint>;
const [repurpose, approved] = BLUEPRINT_FILES.map((f) => built[f]);

/** Every module with the ids that run before it on its path (routes inherit, error handlers see their module). */
function withUpstream(flow: Mod[], upstream: number[] = []): { mod: Mod; upstream: number[] }[] {
  const out: { mod: Mod; upstream: number[] }[] = [];
  let seen = [...upstream];
  for (const mod of flow) {
    out.push({ mod, upstream: seen });
    for (const handler of mod.onerror ?? []) out.push(...withUpstream([handler], [...seen, mod.id]));
    for (const route of mod.routes ?? []) out.push(...withUpstream(route.flow, [...seen, mod.id]));
    seen = [...seen, mod.id];
  }
  return out;
}
const all = (bp: Blueprint) => withUpstream(bp.flow);
const find = (bp: Blueprint, module: string) => all(bp).find((x) => x.mod.module === module)!.mod;
const refsIn = (value: unknown): number[] =>
  [...JSON.stringify(value ?? '').matchAll(/\{\{([^}]*)\}\}/g)].flatMap((m) => [...m[1].matchAll(/(?<![\w.])(\d+)\.(?=[A-Za-z_`$])/g)].map((r) => Number(r[1])));

describe.each(BLUEPRINT_FILES)('%s', (file) => {
  const bp = built[file];

  it('has the shape of an exported Make blueprint', () => {
    expect(typeof bp.name).toBe('string');
    expect(Array.isArray(bp.flow)).toBe(true);
    expect(bp.metadata.scenario).toMatchObject({ roundtrips: 1, maxErrors: 3, autoCommit: true, sequential: false, confidential: false, dataloss: false, dlq: false });
  });

  it('uses only module versions seen in real Make exports (make/known-modules.json)', () => {
    for (const { mod } of all(bp)) {
      expect(known.modules, `${mod.module} v${mod.version}`).toContainEqual({ module: mod.module, version: mod.version });
    }
  });

  it('gives every module a unique id and a canvas position', () => {
    const ids = all(bp).map((x) => x.mod.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { mod } of all(bp)) expect(mod.metadata?.designer, `module ${mod.id}`).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
  });

  it('only maps data from modules that run earlier on the same path', () => {
    for (const { mod, upstream } of all(bp)) {
      for (const ref of refsIn([mod.mapper, mod.filter, mod.parameters])) expect(upstream, `module ${mod.id} reads {{${ref}.…}}`).toContain(ref);
    }
  });

  it('carries no account connections or personal IDs', () => {
    const text = JSON.stringify(bp);
    expect(text).not.toMatch(/__IMTCONN__|"account":|sk-ant-/);
  });

  it('matches the committed file (run npm run build:blueprints)', () => {
    expect(JSON.parse(readFileSync(`make/blueprints/${file}`, 'utf8'))).toEqual(bp);
  });
});

describe('scenario 1: repurpose new posts', () => {
  const claude = find(repurpose, 'anthropic-claude:createAMessage');

  it('sends the tested system prompt to Claude', () => {
    expect(claude.mapper!.system).toBe(renderSystemPrompt());
    expect(claude.mapper!.model).toBe('claude-opus-5-5');
    expect(claude.mapper!.max_tokens).toBe(16000);
    expect(claude.mapper).not.toHaveProperty('temperature');
  });

  it(`cuts the article text at ${LIMITS.articleChars} characters with a visible marker`, () => {
    const content: string = claude.mapper!.messages[0].content;
    expect(content).toContain(`substring(`);
    expect(content).toContain(`${LIMITS.articleChars})`);
    expect(content).toContain('[truncated]');
    expect(content).toMatch(/<article>[\s\S]*<\/article>/);
  });

  it('strips ```json fences before parsing Claude\'s reply', () => {
    expect(find(repurpose, 'json:ParseJSON').mapper!.json).toContain('replace(');
  });

  it('emails the marketer if Claude or the JSON parsing fails, instead of stopping', () => {
    for (const mod of [claude, find(repurpose, 'json:ParseJSON')]) {
      expect(mod.onerror?.map((h) => h.module)).toEqual(['google-email:ActionSendEmail', 'builtin:Ignore']);
    }
  });

  const router = find(repurpose, 'builtin:BasicRouter');
  const [good, bad] = router.routes!.map((r) => r.flow[0]);

  it('routes good drafts to the approval sheet and the rest to the marketer', () => {
    expect(good.module).toBe('google-sheets:addRow');
    expect(bad.module).toBe('google-email:ActionSendEmail');
  });

  it('checks the same limits as src/validate.ts', () => {
    const limits = good.filter!.conditions.flat().map((c) => Number(c.b));
    for (const n of [LIMITS.linkedin, LIMITS.newsletter, LIMITS.xPost, LIMITS.xPostsMin, LIMITS.xPostsMax, LIMITS.hashtagsMin, LIMITS.hashtagsMax]) {
      expect(limits).toContain(n);
    }
    const xChecks = good.filter!.conditions.flat().filter((c) => c.a.includes('get(') && Number(c.b) === LIMITS.xPost);
    expect(xChecks).toHaveLength(LIMITS.xPostsMax);
  });

  it('the fallback route is the exact opposite of the good route', () => {
    const goodChecks = good.filter!.conditions[0];
    expect(bad.filter!.conditions).toHaveLength(goodChecks.length);
    for (const [i, group] of bad.filter!.conditions.entries()) {
      expect(group).toHaveLength(1);
      expect(group[0].a).toBe(goodChecks[i].a);
      expect(group[0].b).toBe(goodChecks[i].b);
    }
  });

  it('writes drafts as raw text, so AI text can never run as a spreadsheet formula', () => {
    expect(good.mapper!.valueInputOption).toBe('RAW');
    expect(good.mapper!.values['0']).toBe('pending');
  });
});

describe('scenario 2: send approved posts', () => {
  it('reads the sheet, posts only approved rows to Slack, then marks them ready', () => {
    expect(approved.flow.map((m) => m.module)).toEqual(['google-sheets:filterRows', 'slack:CreateMessage', 'google-sheets:updateRow']);
    const slack = approved.flow[1];
    expect(slack.filter!.conditions).toEqual([[{ a: '{{1.`0`}}', b: 'approved', o: 'text:equal:ci' }]]);
    expect(approved.flow[2].mapper!.values).toEqual({ '0': 'ready' });
  });
});

describe('final review fixes', () => {
  const router = find(repurpose, 'builtin:BasicRouter');
  const good = router.routes![0].flow[0];

  it('rejects an empty or missing LinkedIn post or newsletter blurb, like the mirror', () => {
    const checks = good.filter!.conditions[0];
    for (const field of ['linkedin_post', 'newsletter_blurb']) {
      expect(checks).toContainEqual({ a: `{{length(5.${field})}}`, b: '1', o: 'number:greaterorequal' });
    }
  });

  it('reads a missing thread post as empty text, so short threads are not rejected', () => {
    const xChecks = good.filter!.conditions[0].filter((c) => c.a.includes('get('));
    for (const c of xChecks) expect(c.a).toMatch(/^\{\{length\(ifempty\(get\(5\.x_thread; \d\); ""\)\)\}\}$/);
  });

  it('treats a failed page fetch as an error and emails the marketer instead of drafting from an error page', () => {
    const fetch = find(repurpose, 'http:ActionSendData');
    expect(fetch.parameters).toMatchObject({ handleErrors: true });
    expect(fetch.onerror?.map((h) => h.module)).toEqual(['google-email:ActionSendEmail', 'builtin:Ignore']);
  });

  it('scenario 2 asks Google Sheets for approved rows only, so a long sheet cannot hide them', () => {
    expect(approved.flow[0].mapper!.filter).toEqual([[{ a: 'A', b: 'approved', o: 'text:equal:ci' }]]);
  });
});

