import { describe, it, expect } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POPUP_SURFACES } from '../e2e/popupSurfaces';

const web = fileURLToPath(new URL('..', import.meta.url));
const EXPANDED = /aria-expanded=|<details[\s>]/g;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

const rendered: Record<string, number> = {};
for (const file of globSync('src/**/*.tsx', { cwd: web })) {
  const code = readFileSync(`${web}${file}`, 'utf8').replace(BLOCK_COMMENT, '');
  const count = code.match(EXPANDED)?.length ?? 0;
  if (count > 0) rendered[basename(file, '.tsx')] = count;
}

describe('popup surfaces', () => {
  it('finds the controls, so an empty scan cannot pass', () => {
    expect(Object.keys(rendered).length).toBeGreaterThanOrEqual(8);
  });

  it('lists every component that renders one, with its count', () => {
    expect(rendered).toEqual(POPUP_SURFACES);
  });
});
