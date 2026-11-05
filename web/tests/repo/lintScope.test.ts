import { describe, it, expect, beforeAll } from 'vitest';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../..', import.meta.url));
const eslint = new ESLint({ cwd });

beforeAll(async () => {
  await eslint.calculateConfigForFile('src/main.tsx');
}, 30_000);

describe('the generated trees are outside the linter', () => {
  it.each(['src/engine/vendor/openrocket-engine.mjs', 'dist/sw.js'])('ignores %s', async (rel) => {
    expect(await eslint.isPathIgnored(rel)).toBe(true);
  });

  it('still lints our own sources', async () => {
    for (const rel of ['src/main.tsx', 'src/services/storage/storageKeys.ts', 'scripts/sync-motors.mjs']) {
      expect(await eslint.isPathIgnored(rel), rel).toBe(false);
    }
  });

  it('still lints the tests and the e2e specs', async () => {
    for (const rel of ['tests/repo/lintScope.test.ts', 'e2e/base.ts']) {
      expect(await eslint.isPathIgnored(rel), rel).toBe(false);
    }
  });
});

// A rule turned off still resolves to a truthy `[0, ...]`.
const severity = (rules: Record<string, unknown> | undefined, rule: string): number => {
  const v = rules?.[rule];
  const level = Array.isArray(v) ? (v[0] as unknown) : v;
  return level === 'error' ? 2 : level === 'warn' ? 1 : typeof level === 'number' ? level : 0;
};

describe('the rules that are enabled are enabled on real files', () => {
  it('resolves the type-aware promise rules for a component', async () => {
    const cfg = await eslint.calculateConfigForFile('src/components/layout/AppHeader.tsx');
    expect(severity(cfg.rules, '@typescript-eslint/no-floating-promises')).toBe(2);
    expect(severity(cfg.rules, '@typescript-eslint/no-misused-promises')).toBe(2);
  });

  it('resolves the hook rules as errors', async () => {
    const cfg = await eslint.calculateConfigForFile('src/components/layout/AppHeader.tsx');
    expect(severity(cfg.rules, 'react-hooks/rules-of-hooks')).toBe(2);
  });

  // A later block's `no-restricted-syntax` replaces an earlier one, so each layer block has to carry the selector.
  it.each([
    'src/components/layout/AppHeader.tsx',
    'src/state/store.ts',
    'src/services/app/must.ts',
    'src/tree/position.ts',
  ])('bans a non-null assertion outside an index in %s', async (rel) => {
    const cfg = await eslint.calculateConfigForFile(rel);
    expect(JSON.stringify(cfg.rules?.['no-restricted-syntax'])).toContain('TSNonNullExpression');
  });

  it('limits function size and complexity in the sources, not the tests', async () => {
    const source = await eslint.calculateConfigForFile('src/state/store.ts');
    expect(severity(source.rules, 'max-lines-per-function')).toBe(2);
    expect(severity(source.rules, 'complexity')).toBe(2);
    const test = await eslint.calculateConfigForFile('tests/repo/lintScope.test.ts');
    expect(severity(test.rules, 'max-lines-per-function')).toBe(0);
  });

  it('leaves the type-aware rules OFF for the plain .mjs scripts', async () => {
    const cfg = await eslint.calculateConfigForFile('scripts/sync-motors.mjs');
    expect(severity(cfg.rules, '@typescript-eslint/no-floating-promises')).toBe(0);
  });
});
