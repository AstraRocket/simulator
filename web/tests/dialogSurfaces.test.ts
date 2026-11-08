import { describe, it, expect } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIALOG_SURFACES } from '../e2e/dialogSurfaces';

const web = fileURLToPath(new URL('..', import.meta.url));
const SHELL = /<(?:Dialog|AlertDialog|MasterDetailDialog)[\s>/]/g;
const WRAPPERS = new Set(['MasterDetail']);

const rendered: Record<string, number> = {};
for (const file of globSync('src/**/*.tsx', { cwd: web })) {
  if (WRAPPERS.has(basename(file, '.tsx'))) continue;
  const count = readFileSync(`${web}${file}`, 'utf8').match(SHELL)?.length ?? 0;
  if (count > 0) rendered[basename(file, '.tsx')] = count;
}

describe('dialog surfaces', () => {
  it('finds the shells, so an empty scan cannot pass', () => {
    expect(Object.keys(rendered).length).toBeGreaterThanOrEqual(25);
  });

  it('lists every component that renders a dialog, with its count', () => {
    expect(rendered).toEqual(DIALOG_SURFACES);
  });
});
