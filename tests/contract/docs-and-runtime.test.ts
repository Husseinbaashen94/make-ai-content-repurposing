import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBlueprints, DRAFTS_COLUMNS } from '../../scripts/build-blueprints.js';

const read = (path: string) => readFileSync(path, 'utf8');
const firstMajor = (range: string) => Number(range.match(/(\d+)/)![1]);

describe('build guide stays in step with the blueprints', () => {
  it('the Drafts sheet header in docs/build-guide.md matches the columns the scenarios use', () => {
    const header = read('docs/build-guide.md').split('```\n')[1].trim();
    expect(header.split('\t')).toEqual([...DRAFTS_COLUMNS]);
  });

  it('scenario 1 writes exactly that many columns', () => {
    const text = JSON.stringify(buildBlueprints()['1-repurpose-new-posts.json']);
    const values = JSON.parse(text).flow[5].routes[0].flow[0].mapper.values;
    expect(Object.keys(values)).toHaveLength(DRAFTS_COLUMNS.length);
  });

  it('lists every placeholder the client must replace after import', () => {
    const guide = read('docs/build-guide.md');
    for (const placeholder of ['https://your-blog.example/feed.xml', 'marketing@your-company.example']) {
      expect(JSON.stringify(buildBlueprints())).toContain(placeholder);
      expect(guide).toContain(placeholder);
    }
  });
});

describe('runtime requirements a client will actually hit', () => {
  const pkg = JSON.parse(read('package.json'));
  const vitestFloor = firstMajor(JSON.parse(read('node_modules/vitest/package.json')).engines.node);

  it('declares at least the Node version the test runner requires', () => {
    expect(firstMajor(pkg.engines.node)).toBeGreaterThanOrEqual(vitestFloor);
  });

  it.each(['.github/workflows/ci.yml', '.github/workflows/live-eval.yml'])('%s runs on a supported Node version', (file) => {
    expect(Number(read(file).match(/node-version:\s*(\d+)/)![1])).toBeGreaterThanOrEqual(firstMajor(pkg.engines.node));
  });

  it('the README states the Node version', () => {
    expect(read('README.md')).toContain(`Node.js | ${firstMajor(pkg.engines.node)}.12 or newer`);
  });
});

describe('repository hygiene', () => {
  it('commits no test-run output', () => {
    expect(execFileSync('git', ['ls-files', '.vitest', 'out'], { encoding: 'utf8' }).trim()).toBe('');
  });
});
