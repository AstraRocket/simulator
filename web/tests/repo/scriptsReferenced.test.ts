import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../..', import.meta.url));
const repo = fileURLToPath(new URL('../../..', import.meta.url));
const read = (p: string) => readFileSync(p, 'utf8');

const scripts = readdirSync(`${web}scripts`).filter((f) => f.endsWith('.mjs'));

const libs = readdirSync(`${web}scripts/lib`).filter((f) => f.endsWith('.mjs'));

interface Source {
  path: string;
  text: string;
}

const sources = (): Source[] => {
  const wf = `${repo}/.github/workflows`;
  return [
    { path: 'package.json', text: read(`${web}package.json`) },
    ...readdirSync(wf).map((f) => ({ path: `../.github/workflows/${f}`, text: read(`${wf}/${f}`) })),
    ...scripts.map((f) => ({ path: `scripts/${f}`, text: read(`${web}scripts/${f}`) })),
    ...libs.map((f) => ({ path: `scripts/lib/${f}`, text: read(`${web}scripts/lib/${f}`) })),
  ];
};

const orphansIn = (dir: 'scripts' | 'scripts/lib', files: string[], from: Source[]): string[] =>
  files.filter((f) => {
    const self = `${dir}/${f}`;
    const asPath = new RegExp(`${dir === 'scripts' ? 'scripts' : 'lib'}/${f.replace('.', '\\.')}\\b`);
    return !from.some((s) => s.path !== self && asPath.test(s.text));
  });

describe('no orphan build script', () => {
  const all = sources();

  it('finds a caller for every scripts/*.mjs', () => {
    expect(orphansIn('scripts', scripts, all)).toEqual([]);
  });

  it('finds an importer for every scripts/lib module', () => {
    expect(orphansIn('scripts/lib', libs, all)).toEqual([]);
  });

  it('does not count a script naming itself as its caller', () => {
    const own = (path: string) => all.filter((s) => s.path === path);
    expect(own('scripts/gen-icons.mjs')[0]?.text).toMatch(/scripts\/gen-icons\.mjs/);
    expect(orphansIn('scripts', ['gen-icons.mjs'], own('scripts/gen-icons.mjs'))).toEqual(['gen-icons.mjs']);
    expect(own('scripts/lib/dataManifest.mjs')[0]?.text).toMatch(/lib\/dataManifest\.mjs/);
    expect(orphansIn('scripts/lib', ['dataManifest.mjs'], own('scripts/lib/dataManifest.mjs'))).toEqual([
      'dataManifest.mjs',
    ]);
  });

  it('scans a plausible number of scripts, so an empty glob cannot pass', () => {
    expect(scripts.length).toBeGreaterThanOrEqual(13);
    expect(libs.length).toBeGreaterThanOrEqual(3);
  });
});
