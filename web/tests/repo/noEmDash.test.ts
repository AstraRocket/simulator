import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// This file names the character only as an escape, so it does not match itself.
const EM_DASH = '\u2014';
const EM_DASH_ENTITY = /&(?:mdash|#0*8212|#x0*2014);/i;

const searchable = (path: string, line: string): string =>
  /\.mdx?$/.test(path) ? line.replace(/`[^`\n]*`/g, '') : line;

const slashed = (url: URL): string => fileURLToPath(url).replace(/\\/g, '/');
const web = slashed(new URL('../..', import.meta.url));
const repo = slashed(new URL('../../..', import.meta.url));

const isForeignLocale = (path: string): boolean =>
  /\/i18n\/locales\/(?!en\.json$)[^/]+\.json$/.test(path) || /\/website\/i18n\/(?!en\/)/.test(path);

const skipped = [
  '/src/engine/vendor',
  '/docs/rasaero/diffs',
  '/website/build',
  '/website/.docusaurus',
  '/engine-java/src/java',
  '/engine-java/.openrocket-src',
  '/engine-java/build',
  '/engine-java/reference/build',
  '/engine-java/.gradle',
];

const walk = (dir: string, keep: (path: string) => boolean, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = `${dir}/${entry}`;
    if (skipped.some((tail) => full.endsWith(tail))) continue;
    if (statSync(full).isDirectory()) walk(full, keep, out);
    else if (keep(full)) out.push(full);
  }
  return out;
};

const anyFile = (path: string): boolean => !isForeignLocale(path);
const markdown = (path: string): boolean => path.endsWith('.md');

const shallow = (dir: string, keep: (path: string) => boolean): string[] =>
  readdirSync(dir)
    .map((entry) => `${dir}/${entry}`)
    .filter((full) => statSync(full).isFile() && keep(full));

const roots: string[] = [];
const from = (dir: string, list: (dir: string) => string[]): string[] => {
  roots.push(dir);
  return existsSync(dir) ? list(dir) : [];
};
const tree = (dir: string, keep: (path: string) => boolean): string[] => from(dir, (d) => walk(d, keep));
const top = (dir: string, keep: (path: string) => boolean): string[] => from(dir, (d) => shallow(d, keep));

const files = [
  ...tree(`${web}src`, anyFile),
  ...tree(`${web}tests`, anyFile),
  ...tree(`${web}e2e`, anyFile),
  ...tree(`${web}scripts`, anyFile),
  ...top(web.slice(0, -1), (f) => !f.endsWith('/package-lock.json')),
  ...tree(`${repo}website`, anyFile),
  ...tree(`${repo}.github`, anyFile),
  ...tree(`${repo}engine-java`, anyFile),
  ...tree(`${repo}docs`, markdown),
  ...top(repo.slice(0, -1), (f) => markdown(f) || /\/(\.[^/]+|cspell\.json)$/.test(f)),
  ...tree(`${repo}.cspell`, anyFile),
];

const hits = (paths: string[]): string[] => {
  const found: string[] = [];
  for (const path of paths) {
    const bytes = readFileSync(path);
    if (bytes.includes(0)) continue;
    const lines = bytes.toString('utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.includes(EM_DASH) || EM_DASH_ENTITY.test(searchable(path, line))) {
        found.push(`${path.slice(repo.length)}:${i + 1}`);
      }
    });
  }
  return found;
};

describe('the em dash', () => {
  it('starts only from folders the repository tracks', () => {
    const untracked = roots.filter(
      (dir) => !existsSync(dir) || execFileSync('git', ['ls-files', '--', dir], { cwd: repo }).length === 0,
    );
    expect(untracked).toEqual([]);
  });

  it('scans the trees it claims to', () => {
    expect(files.some((f) => f.endsWith('/src/i18n/locales/en.json'))).toBe(true);
    expect(files.some((f) => f.endsWith('/src/i18n/locales/es.json'))).toBe(false);
    expect(files.some((f) => f.includes('/src/engine/vendor/'))).toBe(false);
    expect(files.some((f) => f.includes('/.github/workflows/'))).toBe(true);
    expect(files.some((f) => f.includes('/.github/ISSUE_TEMPLATE/'))).toBe(true);
    expect(files.some((f) => f.includes('/website/docs/'))).toBe(true);
    expect(files.some((f) => f.includes('/website/i18n/es/'))).toBe(false);
    expect(files.some((f) => f.includes('/website/build/'))).toBe(false);
    expect(files.some((f) => f.endsWith('/engine-java/src/api/java/api/OpenRocketEngine.java'))).toBe(true);
    expect(files.some((f) => f.includes('/engine-java/src/java/'))).toBe(false);
    expect(files.some((f) => f.endsWith('/engine-java/build.gradle'))).toBe(true);
    expect(files.some((f) => f.endsWith('/engine-java/extract/manifest.txt'))).toBe(true);
    expect(files.some((f) => f.includes('/engine-java/.openrocket-src/'))).toBe(false);
    expect(files.some((f) => f.endsWith('/web/vitest.config.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('/.gitattributes'))).toBe(true);
    expect(files.some((f) => f.endsWith('/CODE_OF_CONDUCT.md'))).toBe(true);
  });

  it('is caught written as an entity, outside a Markdown code span', () => {
    const amp = '&';
    for (const e of [`${amp}mdash;`, `${amp}#8212;`, `${amp}#x2014;`, `${amp}#X2014;`]) {
      expect(EM_DASH_ENTITY.test(searchable('/a.tsx', `<td>${e}</td>`))).toBe(true);
      expect(EM_DASH_ENTITY.test(searchable('/a.md', `a ${e} b`))).toBe(true);
      expect(EM_DASH_ENTITY.test(searchable('/a.md', `a \`${e}\` b`))).toBe(false);
    }
    expect(EM_DASH_ENTITY.test(`${amp}ndash;`)).toBe(false);
  });

  it('appears nowhere in scope', () => {
    expect(hits(files)).toEqual([]);
  });
});
