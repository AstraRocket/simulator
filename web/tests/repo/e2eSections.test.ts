import { describe, expect, it } from 'vitest';
import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { SECTIONS, STEPS } from '../../scripts/lib/e2eSectionList.mjs';

/**
 * `npm run e2e:sections` runs only the specs its sections name, so a spec in no
 * section would never run there, and one in two would run twice.
 */
const web = fileURLToPath(new URL('../..', import.meta.url));
const onDisk = globSync('e2e/*.spec.ts', { cwd: web })
  .map((f) =>
    f
      .replace(/\\/g, '/')
      .replace(/^e2e\//, '')
      .replace(/\.spec\.ts$/, ''),
  )
  .sort();
const listed = Object.values(SECTIONS).flat();

describe('e2e sections', () => {
  it('place every spec in exactly one section', () => {
    expect([...listed].sort()).toEqual(onDisk);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('name steps that exist, under names no section uses', () => {
    for (const file of Object.values(STEPS)) expect(existsSync(`${web}scripts/${file}`), file).toBe(true);
    for (const name of Object.keys(STEPS)) expect(SECTIONS[name], name).toBeUndefined();
  });
});
