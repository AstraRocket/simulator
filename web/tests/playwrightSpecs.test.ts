import { describe, it, expect } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const config = readFileSync(`${web}playwright.config.ts`, 'utf8');

const list = (name: string): string[] => {
  const body = config.match(new RegExp(`const ${name}\\s*=\\s*\\[([^\\]]*)\\]`))?.[1] ?? '';
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
};

const allGlobs = [...new Set([...config.matchAll(/'(\*\*\/[^']+\.spec\.ts)'/g)].map((m) => m[1]!))];

const matches = (glob: string): string[] => globSync(glob, { cwd: `${web}e2e` });

describe('playwright spec globs', () => {
  const core = list('CORE_SPECS');
  const mobile = list('MOBILE_SPECS');

  it('reads both lists, so an empty parse cannot pass', () => {
    expect(core.length).toBeGreaterThanOrEqual(10);
    expect(mobile.length).toBeGreaterThanOrEqual(3);
    expect(allGlobs.length).toBeGreaterThanOrEqual(core.length);
  });

  it.each([...new Set([...core, ...mobile, ...allGlobs])])('%s matches a spec in e2e/', (glob) => {
    expect(matches(glob)).not.toEqual([]);
  });
});
