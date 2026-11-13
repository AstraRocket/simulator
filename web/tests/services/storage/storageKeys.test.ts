// cspell:ignore astrarrocketjs -- the misspelled prefix, named below where the
// kernel's patch marker is explained.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STORAGE_PREFIX, nsKey } from '../../../src/services/storage/storageKeys';

const repo = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));

const KEY_FORM = `${STORAGE_PREFIX}:`;

const ALLOWED = new Set([
  'web/src/services/storage/storageKeys.ts',
  // The plain .mjs check harnesses cannot import the constant; a mismatch makes their checks fail.
  'web/scripts/lib/previewCheck.mjs',
  'docs/ARCHITECTURE.md',
]);

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    // `engine-java` holds the deliberately misspelled `PATCH(astrarrocketjs)` marker, not a storage key.
    if (
      [
        'node_modules',
        '.git',
        'dist',
        'build',
        'coverage',
        'vendor',
        'public',
        '.docusaurus',
        'test-results',
        'engine-java',
      ].includes(entry)
    )
      continue;
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js|json|md|ya?ml)$/.test(entry)) out.push(full);
  }
  return out;
};

describe('the storage namespace has one home', () => {
  it('builds a key from the prefix and a suffix', () => {
    expect(nsKey('designs:index')).toBe(`${STORAGE_PREFIX}:designs:index`);
    expect(nsKey('workspace')).toBe(`${STORAGE_PREFIX}:workspace`);
  });

  it('is spelled astrarocket, pinned as a literal', () => {
    // Deriving it from `STORAGE_PREFIX` would pass for any spelling.
    expect(STORAGE_PREFIX).toBe('astrarocket');
  });

  it('spells a KEY in no file but the ones allowed to', () => {
    const root = repo('').replace(/\/$/, '');
    const offenders = walk(root)
      .filter((f) => readFileSync(f, 'utf8').includes(KEY_FORM))
      .map((f) => f.slice(root.length + 1))
      .filter((rel) => !ALLOWED.has(rel))
      .sort();
    expect(offenders).toEqual([]);
  });

  it('allows no file that does not spell a key', () => {
    const stale = [...ALLOWED].filter((rel) => {
      try {
        return !readFileSync(repo(rel), 'utf8').includes(KEY_FORM);
      } catch {
        return true;
      }
    });
    expect(stale).toEqual([]);
  });

  it('keeps every key on one namespace', () => {
    const prefixes = new Set(
      [nsKey('designs:index'), nsKey('settings:v1'), nsKey('engine')].map((k) => k.split(':')[0]),
    );
    expect([...prefixes]).toEqual([STORAGE_PREFIX]);
  });
});
