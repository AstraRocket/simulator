import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error - a plain .mjs build script helper, no types
import { byFileName as untyped } from '../../scripts/lib/orcText.mjs';

type File = { name: string; text: string };
const byFileName = untyped as (files: File[]) => File[];

/**
 * The parts catalog's row order follows the order its files are read in, and
 * the manifest hashes the rows, so a change of order alone makes every browser
 * download the catalog again. The order has to be the same on every machine.
 */
describe('part file order', () => {
  const names = ['zeta.orc', 'Apogee.orc', 'BalsaMachining.orc', 'always_ready.orc', 'Estes.orc'];
  const files = (list: string[]) => list.map((name) => ({ name, text: '' }));

  it('is the same whatever order the directory lists them in', () => {
    const expected = byFileName(files(names)).map((f) => f.name);
    for (let shift = 1; shift < names.length; shift++) {
      const listed = [...names.slice(shift), ...names.slice(0, shift)];
      expect(byFileName(files(listed)).map((f) => f.name)).toEqual(expected);
      expect(byFileName(files([...listed].reverse())).map((f) => f.name)).toEqual(expected);
    }
  });

  it('compares code units, not the locale or the case-folded name', () => {
    expect(byFileName(files(names)).map((f) => f.name)).toEqual([
      'Apogee.orc',
      'BalsaMachining.orc',
      'Estes.orc',
      'always_ready.orc',
      'zeta.orc',
    ]);
  });

  it('is applied to both sets of part files sync-components reads', () => {
    const src = readFileSync(fileURLToPath(new URL('../../scripts/sync-components.mjs', import.meta.url)), 'utf8');
    for (const reader of ['const orcFiles', 'function jarFiles']) {
      const at = src.indexOf(reader);
      expect(at, reader).toBeGreaterThanOrEqual(0);
      expect(src.slice(at, at + 200), reader).toContain('byFileName(');
    }
  });
});
