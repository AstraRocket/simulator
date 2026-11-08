import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { retryUrl } from '../../src/engine/openRocketEngine';

// Workbox strips params matching `ignoreURLParametersMatching` before a precache lookup.

const config = readFileSync(fileURLToPath(new URL('../../vite.config.ts', import.meta.url)), 'utf8');

const ignored = (): RegExp[] => {
  const m = /ignoreURLParametersMatching:\s*\[([^\]]*)\]/.exec(config);
  if (!m) throw new Error('ignoreURLParametersMatching not found in vite.config.ts');
  return m[1]!
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((lit) => {
      const r = /^\/(.*)\/([a-z]*)$/.exec(lit);
      if (!r) throw new Error(`not a regex literal: ${lit}`);
      return new RegExp(r[1]!, r[2]);
    });
};

const precacheLookup = (href: string): string => {
  const url = new URL(href);
  const patterns = ignored();
  for (const key of [...url.searchParams.keys()]) {
    if (patterns.some((p) => p.test(key))) url.searchParams.delete(key);
  }
  return url.href;
};

describe('engine retry url', () => {
  const wasm = 'https://example.test/app/engine/openrocket-engine.wasm';
  const runtime = 'https://example.test/app/engine/openrocket-engine.wasm-runtime.js';

  it('leaves the first attempt alone and varies every later one', () => {
    expect(retryUrl(wasm, 0)).toBe(wasm);
    expect(retryUrl(wasm, 1)).not.toBe(wasm);
    expect(retryUrl(wasm, 2)).not.toBe(retryUrl(wasm, 1));
  });

  it('appends to an existing query rather than starting a second one', () => {
    expect(retryUrl(`${wasm}?v=abc`, 1)).toBe(`${wasm}?v=abc&retry=1`);
  });

  it('resolves to the precached key, so a retry works offline', () => {
    for (const attempt of [1, 2, 7]) {
      expect(precacheLookup(retryUrl(wasm, attempt))).toBe(wasm);
      expect(precacheLookup(retryUrl(runtime, attempt))).toBe(runtime);
    }
  });

  it('reads the real list, so a parsing slip cannot pass as a match', () => {
    const patterns = ignored();
    expect(patterns.some((p) => p.test('v'))).toBe(true);
    expect(patterns.some((p) => p.test('retry'))).toBe(true);
    expect(patterns.some((p) => p.test('design'))).toBe(false);
  });
});
