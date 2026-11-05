import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../..', import.meta.url));
const read = (rel: string) => readFileSync(`${repo}${rel}`, 'utf8');

// Records of what was true when written, so an old command name in them is not an error.
const RECORDS = new Set(['docs/AUDIT.md', 'docs/AUDIT_DUPLICATION.md']);

const guides = [
  'README.md',
  'CONTRIBUTING.md',
  ...readdirSync(`${repo}docs`)
    .filter((f) => f.endsWith('.md'))
    .map((f) => `docs/${f}`)
    .filter((f) => !RECORDS.has(f)),
];

const scripts = new Set(
  ['web', 'website', 'engine-java'].flatMap((dir) =>
    Object.keys((JSON.parse(read(`${dir}/package.json`)) as { scripts: Record<string, string> }).scripts),
  ),
);

describe('the guides name what the project has', () => {
  it.each(guides)('%s names only npm scripts that exist', (guide) => {
    // A trailing colon is a pattern such as `test:<step>`, not a script.
    const named = [...read(guide).matchAll(/npm run ([a-z][\w:.-]*)/g)]
      .map((m) => m[1]!)
      .filter((n) => !n.endsWith(':'));
    expect(named.filter((name) => !scripts.has(name))).toEqual([]);
  });

  const gates = read('.github/workflows/gates.yml').split(/^jobs:\s*$/m)[1] ?? '';
  const jobs = [...gates.matchAll(/^ {2}([\w-]+):\s*$/gm)].map((m) => m[1]!);

  it('finds the gate jobs', () => {
    expect(jobs).toContain('build-and-test');
  });

  it.each(['docs/DEVELOPER.md', 'docs/AUDIT_PROMPT.md'])('%s names every gate job', (guide) => {
    const text = read(guide);
    expect(jobs.filter((job) => !text.includes(`\`${job}\``))).toEqual([]);
  });
});
