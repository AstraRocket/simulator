// Apart from aeroTables: saveFile reaches settings, which reaches simulations, which reads the tables.
import { exportFilename } from '../files/saveFile';
import type { AeroTableKind, AeroTableSource } from './aeroTables';

/** The CSV file name a table downloads as: the one it came from, else named for the simulation. */
export function aeroTableFilename(source: AeroTableSource | undefined, simName: string, kind: AeroTableKind): string {
  const base = (source?.file ?? '').split(/[\\/]/).pop() ?? '';
  return base ? exportFilename([base.replace(/\.[^.]*$/, '')], 'csv') : exportFilename([simName, kind], 'csv');
}

/** The rows as a CSV file, as desktop wrote it: no byte-order mark, which its reader would take as part of `mach`. */
export const aeroTableCsv = (rows: readonly string[]): Blob =>
  new Blob([rows.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
