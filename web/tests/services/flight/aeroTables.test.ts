// @vitest-environment jsdom
// cspell:ignore draglookup stabilitylookup draglookupcsv stabilitylookupcsv -- OpenRocket .ork element names
import { describe, it, expect } from 'vitest';
import {
  AERO_TABLE_KINDS,
  aeroRangeFindings,
  aeroTableExample,
  aeroTableGrid,
  aeroTableRange,
  aeroTableRows,
  aeroTableSources,
  aeroTablesOf,
  withAeroTable,
} from '../../../src/services/flight/aeroTables';
import { aeroTableCsv, aeroTableFilename } from '../../../src/services/flight/aeroTableFile';
import { KeyedError } from '../../../src/i18n/keyedError';
import { resultKey, simConditions, type SimPrefs, type Simulation } from '../../../src/services/flight/simulations';
import { defaultRocketTree } from '../../../src/services/design/defaultRocket';
import { DEFAULT_SETTINGS } from '../../../src/services/storage/settings';
import type { CompleteLaunch } from '../../../src/services/flight/requiredLaunch';

const DRAG = '<conditions><draglookup file="drag.csv"><row>mach,cd</row><row>0.5,0.4</row></draglookup></conditions>';
const OTHER = '<conditions><launchpad>1</launchpad></conditions>';

describe('aeroTablesOf', () => {
  it('reads the rows of the tables a simulation carries', () => {
    expect(aeroTablesOf([OTHER, DRAG])).toEqual({ dragLookup: ['mach,cd', '0.5,0.4'] });
  });

  it('is empty for a simulation with none', () => {
    expect(aeroTablesOf(undefined)).toEqual({});
    expect(aeroTablesOf([OTHER])).toEqual({});
  });
});

describe('a tabled simulation', () => {
  const tree = defaultRocketTree();
  const config = { id: 'c', name: 'C', motors: {} };
  const globals = DEFAULT_SETTINGS.simulation as SimPrefs;
  const sim = (xmlExtra?: string[]): Simulation =>
    ({ id: 's', name: 'S', configId: 'c', launch: {}, result: null, ...(xmlExtra ? { xmlExtra } : {}) }) as Simulation;

  it('keys its result on the table, and one without a table keeps its key', () => {
    const plain = resultKey(tree, config, sim(), globals);
    expect(resultKey(tree, config, sim([OTHER]), globals)).toBe(plain);
    expect(resultKey(tree, config, sim([DRAG]), globals)).not.toBe(plain);
  });

  it('hands the rows to the kernel', () => {
    const launch = { launchRodLengthM: 1, launchRodAngleDeg: 0, windAverage: 0, windStdDev: 0 } as CompleteLaunch;
    const options = simConditions(launch, globals, aeroTablesOf([DRAG]));
    expect(options.dragLookup).toEqual(['mach,cd', '0.5,0.4']);
    expect(options.stabilityLookup).toBeUndefined();
  });
});

describe('aeroTableSources', () => {
  it('names the file each table came from and whether its rows are here', () => {
    const path = '<conditions><stabilitylookupcsv>C:\\aero\\cn.csv</stabilitylookupcsv></conditions>';
    expect(aeroTableSources([DRAG, path])).toEqual({
      drag: { file: 'drag.csv', rows: 2 },
      stability: { file: 'C:\\aero\\cn.csv', rows: 0 },
    });
  });

  it('prefers the rows over a path to the same table', () => {
    const path = '<conditions><draglookupcsv>/home/a/drag.csv</draglookupcsv></conditions>';
    expect(aeroTableSources([path, DRAG]).drag).toEqual({ file: 'drag.csv', rows: 2 });
    expect(aeroTableSources([DRAG, path]).drag).toEqual({ file: 'drag.csv', rows: 2 });
  });
});

describe('withAeroTable', () => {
  const table = { file: 'a&b.csv', rows: ['mach,cd', '0.3,0.35'] };

  it('adds a table in the form desktop writes', () => {
    expect(withAeroTable(undefined, 'drag', table)).toEqual([
      '<conditions><draglookup file="a&amp;b.csv"><row>mach,cd</row><row>0.3,0.35</row></draglookup></conditions>',
    ]);
  });

  it('replaces the table of its kind, a path-only one included, and keeps everything else', () => {
    const path = '<conditions><draglookupcsv>/home/a/drag.csv</draglookupcsv></conditions>';
    const out = withAeroTable([OTHER, DRAG, path], 'drag', table)!;
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(OTHER);
    expect(aeroTablesOf(out).dragLookup).toEqual(table.rows);
  });

  it('removes it, leaving no passthrough when nothing else is carried', () => {
    expect(withAeroTable([OTHER, DRAG], 'drag', null)).toEqual([OTHER]);
    expect(withAeroTable([DRAG], 'drag', null)).toBeUndefined();
    expect(withAeroTable([DRAG], 'stability', null)).toEqual([DRAG]);
  });
});

describe('aeroTableRows', () => {
  const keyOf = (text: string, kind: 'drag' | 'stability') => {
    try {
      aeroTableRows(text, kind);
    } catch (e) {
      return e instanceof KeyedError ? [e.key, e.values] : e;
    }
    return null;
  };

  it('keeps every non-blank line, trimmed, as desktop stores them', () => {
    expect(aeroTableRows('# from CFD\r\nMach, AoA, Cd\r\n\r\n 0.3,0,0.35 \r\n0.3,4,0.4\r\n', 'drag')).toEqual([
      '# from CFD',
      'Mach, AoA, Cd',
      '0.3,0,0.35',
      '0.3,4,0.4',
    ]);
  });

  it('reads the separator off the first row and the header as the kernel does', () => {
    expect(aeroTableRows('mach;angle_of_attack;CN;cm;Cp\n0.5;2;0.1;-0.02;0.45', 'stability')).toHaveLength(2);
    expect(aeroTableRows('mach\tcd\n0.5\t1e-1\n0.9\t.5d', 'drag')).toHaveLength(3);
  });

  it.each([
    ['', 'drag', ['errors.aeroTable.missingHeader', undefined]],
    ['speed,cd\n0.3,0.3', 'drag', ['errors.aeroTable.missingMach', undefined]],
    ['mach cd\n0.3 0.3', 'drag', ['errors.aeroTable.missingMach', undefined]],
    ['mach,cn,cp\n0.3,0.1,0.4', 'stability', ['errors.aeroTable.missingColumn', { column: 'cm' }]],
    ['mach,cd\n0.3\n', 'drag', ['errors.aeroTable.missingValue', { column: 'cd', line: 2 }]],
    ['mach,cd\n\n0.3,abc', 'drag', ['errors.aeroTable.badValue', { value: 'abc', column: 'cd', line: 3 }]],
    ['mach,cd\n# none yet', 'drag', ['errors.aeroTable.noData', undefined]],
    ['# from CFD\nmach;cd\n0.3;0.35', 'drag', ['errors.aeroTable.commentFirst', undefined]],
    ['# from CFD\nmach\tcd\n0.3\t0.35', 'drag', ['errors.aeroTable.commentFirst', undefined]],
  ] as const)('rejects %j', (text, kind, expected) => {
    expect(keyOf(text, kind)).toEqual(expected);
  });

  it.each(AERO_TABLE_KINDS)('takes its own %s example', (kind) => {
    expect(aeroTableRows(aeroTableExample(kind).join('\n'), kind)).toEqual(aeroTableExample(kind));
  });
});

describe('showing and downloading a table', () => {
  it('splits the rows into cells as the kernel reads them, comments dropped', () => {
    expect(aeroTableGrid(['mach; cd', '# CFD', '0.3;0.35'])).toEqual({
      header: ['mach', 'cd'],
      body: [['0.3', '0.35']],
    });
  });

  it('downloads under the name it came with, else one named for the simulation', () => {
    expect(aeroTableFilename({ file: 'C:/cfd/my drag.csv', rows: 2 }, 'Sim 1', 'drag')).toBe('my_drag.csv');
    expect(aeroTableFilename({ file: '', rows: 2 }, 'Sim 1', 'stability')).toBe('Sim_1-stability.csv');
  });

  it('writes the rows with no byte-order mark, which desktop would read into the header', async () => {
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(
      await aeroTableCsv(['mach,cd', '0.3,0.35']).arrayBuffer(),
    );
    expect(text).toBe('mach,cd\n0.3,0.35\n');
  });
});

describe('the span a table covers', () => {
  it('reads the Mach and AoA ends, skipping comments, whatever the header case', () => {
    expect(aeroTableRange(['Mach;Angle of Attack;Cd', '# CFD', '0.3;0;0.35', '2;10;0.5', '0.8;5;0.4'])).toEqual({
      mach: [0.3, 2],
      aoa: [0, 10],
    });
    expect(aeroTableRange(['mach,cd', '0.1,0.3', '0.9,0.4'])).toEqual({ mach: [0.1, 0.9] });
  });

  it('flags only a flight past the top of a table it flew', () => {
    const tables = {
      dragLookup: ['mach,cd', '0,0.3', '0.8,0.4'],
      stabilityLookup: ['mach,aoa,cn,cm,cp', '0,0,0,0,0.5', '1,8,1,0,0.5'],
    };
    expect(aeroRangeFindings(tables, { maxMach: 0.7, maxAoaDeg: 4 })).toEqual([]);
    expect(aeroRangeFindings(tables, { maxMach: 0.9, maxAoaDeg: 12 })).toEqual([
      { kind: 'drag', quantity: 'mach', max: 0.8, flown: 0.9 },
      { kind: 'stability', quantity: 'aoa', max: 8, flown: 12 },
    ]);
    expect(aeroRangeFindings({ dragLookup: tables.dragLookup }, { maxMach: 0.5, maxAoaDeg: 40 })).toEqual([]);
  });
});
