import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
describe('sync:all order', () => {
  const web = fileURLToPath(new URL('../../..', import.meta.url));
  const pkg = JSON.parse(readFileSync(`${web}package.json`, 'utf8')) as { scripts: Record<string, string> };
  const steps = [...pkg.scripts['sync:all']!.matchAll(/npm run (sync:[\w-]+)/g)].map((m) => m[1]);

  it.each([
    ['sync:motors', 'sync:motor-digests'],
    ['sync:components', 'sync:preset-digests'],
  ])('runs %s before %s', (stage, digest) => {
    expect(steps.indexOf(stage)).toBeGreaterThanOrEqual(0);
    expect(steps.indexOf(stage)).toBeLessThan(steps.indexOf(digest));
  });

  it('is the order DEVELOPER.md lists', () => {
    const doc = readFileSync(`${web}../docs/DEVELOPER.md`, 'utf8');
    const listed = [...doc.matchAll(/^npm run (sync:[\w-]+)/gm)].map((m) => m[1]).filter((s) => steps.includes(s));
    expect(listed).toEqual(steps);
  });
});
