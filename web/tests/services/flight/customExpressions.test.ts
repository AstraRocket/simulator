// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { FlightResult, RocketTree } from '../../../src/engine/openRocketEngine';
import {
  customExpressionsOf,
  expressionUnit,
  importExpressions,
  nameFault,
  withCustomExpressions,
  type CustomExpression,
} from '../../../src/services/flight/customExpressions';
import { appliesLate } from '../../../src/services/flight/expressionVocabulary';
import { flightColumns } from '../../../src/services/flight/flightColumns';
import { flightDataCsv } from '../../../src/services/exports/csvExport';
import { METRIC_UNITS } from '../../../src/prefs/units';
import { extraSeries, traceLabel, type Branch } from '../../../src/components/canvas/flightChartTraces';
import { newFlightConfig } from '../../../src/services/flight/flightConfigs';
import { resultKey } from '../../../src/services/flight/simulations';
import { exportOrk, importOrk } from '../../../src/services/files/orkFile';
import { noteTexts } from '../../testing/importNotes';

const KE: CustomExpression = { name: 'Kinetic energy', symbol: 'KE', unit: 'J', expression: '0.5*m*Vt^2' };
const CLIMB: CustomExpression = { name: 'Climb', symbol: 'CL', unit: 'm/s', expression: '(h-h[t-0.5])/0.5' };

describe('the expressions of a design', () => {
  it('reads nothing from a design without any, or with something else there', () => {
    expect(customExpressionsOf({})).toEqual([]);
    expect(customExpressionsOf({ customExpressions: [KE, { name: 'x' }, null] as never })).toEqual([KE]);
  });

  it('leaves no empty list behind', () => {
    const tree: RocketTree = { components: [] };
    const one = withCustomExpressions(tree, [KE]);
    expect(one.customExpressions).toEqual([KE]);
    expect(withCustomExpressions(one, [])).toEqual(tree);
  });

  it('imports those whose symbol and name are free', () => {
    const from = [CLIMB, { ...KE, expression: 'm' }, { ...CLIMB, symbol: 'XX', name: 'kinetic ENERGY' }];
    expect(importExpressions([KE], from)).toEqual({ list: [KE, CLIMB], added: 1, skipped: 2 });
  });

  it('refuses the names desktop refuses, and one another variable has', () => {
    expect(nameFault(' ', [])).toBe('empty');
    expect(nameFault('a (b)', [])).toBe('characters');
    expect(nameFault('ALTITUDE', ['Altitude'])).toBe('taken');
    expect(nameFault('Kinetic energy', ['Altitude'])).toBeNull();
  });

  it('converts an SI unit and shows any other as written', () => {
    expect(expressionUnit('m/s')).toEqual({ quantity: 'velocity', unit: '' });
    expect(expressionUnit('kg m^2')).toEqual({ unit: 'kg·m²' });
    expect(expressionUnit('furlong')).toEqual({ unit: 'furlong' });
    expect(expressionUnit('constructor')).toEqual({ unit: 'constructor' });
  });
});

describe('a function followed by an operator', () => {
  it('is found wherever it is', () => {
    expect(appliesLate('lclip(h,5)+1')).toBe(true);
    expect(appliesLate('2*mean(h[0:t]) / 3')).toBe(true);
    expect(appliesLate('1+(uclip(abs(h),5)-2)')).toBe(true);
  });

  it('is not one with the operator before it, in parentheses, or by another name', () => {
    expect(appliesLate('1+lclip(h,5)')).toBe(false);
    expect(appliesLate('(lclip(h,5))+1')).toBe(false);
    expect(appliesLate('abs(h)+1')).toBe(false);
    expect(appliesLate('x_mean(h)+1')).toBe(false);
    expect(appliesLate('lclip(h')).toBe(false);
  });
});

describe('a flight that recorded expressions', () => {
  const result = {
    summary: {},
    events: [],
    series: { time: [0, 1], altitude: [0, 10], $CL: [null, 20], $KE: [0, 5], $OLD: [1, 2] },
    expressions: [
      { symbol: 'KE', name: 'Kinetic energy', unit: 'J' },
      { symbol: 'CL', name: 'Climb', unit: 'm/s' },
    ],
  } as unknown as FlightResult;

  it('offers them to the chart by name, in their order, after the built-in series', () => {
    const extras = extraSeries([{ key: 'a', series: result.series } as Branch], result.expressions);
    expect(extras.map((m) => traceLabel(m, (k) => `t:${k}`))).toEqual(['Kinetic energy', 'Climb', 'OLD']);
    expect(extras.map((m) => [m.quantity, m.unit])).toEqual([
      [undefined, 'J'],
      ['velocity', ''],
      [undefined, ''],
    ]);
  });

  it('exports them to CSV by name and display unit', () => {
    expect(flightColumns(result).map((c) => c.key)).toEqual(['time', 'altitude', '$KE', '$CL', '$OLD']);
    const csv = flightDataCsv(
      result,
      { ...METRIC_UNITS, velocity: 'km/h' },
      { columns: ['$KE', '$CL'], columnName: (c) => c.label ?? c.key, simDescription: false, flightEvents: false },
    );
    expect(csv.split('\r\n').slice(0, 3)).toEqual(['# Kinetic energy (J),Climb (km/h)', '0.000,', '5.000,72.000']);
  });
});

describe('the result key', () => {
  const config = newFlightConfig();
  const sim = { id: 's', name: 'A', configId: config.id, launch: {}, result: null } as never;
  const key = (tree: RocketTree) => resultKey(tree, config, { ...(sim as object) } as never, {} as never);

  it('changes with the expressions, and is what it was without any', () => {
    const tree: RocketTree = { components: [] };
    const plain = key(tree);
    expect(key({ ...tree, customExpressions: [] })).toBe(plain);
    const one = key({ ...tree, customExpressions: [KE] });
    expect(one).not.toBe(plain);
    expect(key({ ...tree, customExpressions: [{ ...KE, expression: 'm' }] })).not.toBe(one);
  });
});

describe('a .ork with custom expressions', () => {
  const ork = (datatypes: string) => `<?xml version='1.0' encoding='utf-8'?>
<openrocket version="1.10" creator="OpenRocket 26.11">
  <rocket><name>X</name><subcomponents><stage><name>S</name><subcomponents>
    <bodytube><name>B</name><length>0.3</length><thickness>0.001</thickness><radius>0.026</radius></bodytube>
  </subcomponents></stage></subcomponents></rocket>
  ${datatypes}
</openrocket>`;
  const DATATYPES = `<datatypes>
    <type source="customexpression">
      <name>Kinetic energy</name>
      <symbol>KE</symbol>
      <unit unittype="auto">J</unit>
      <expression>0.5*m*Vt^2</expression>
    </type>
    <type source="customexpression">
      <name>Below</name><symbol>BL</symbol><unit unittype="auto"></unit><expression>uclip(h,5)&lt;</expression>
    </type>
    <type source="other"><name>Not one</name></type>
  </datatypes>`;

  it('reads them in order, and says nothing of them', () => {
    const res = importOrk(ork(DATATYPES));
    expect(res.tree.customExpressions).toEqual([
      KE,
      { name: 'Below', symbol: 'BL', unit: '', expression: 'uclip(h,5)<' },
    ]);
    expect(res.tree.docExtra).toBeUndefined();
    expect(noteTexts(res.notes).join('\n')).not.toMatch(/datatypes/);
  });

  it('writes them once, before the simulations, as desktop does', () => {
    const res = importOrk(ork(DATATYPES));
    const out = exportOrk({ name: res.name, tree: res.tree });
    expect(importOrk(out).tree.customExpressions).toEqual(res.tree.customExpressions);
    expect(out.match(/<datatypes>/g)).toHaveLength(1);
    expect(out).toContain('<unit unittype="auto">J</unit>');
    expect(out).toContain('<unit unittype="auto"></unit>');
    if (out.includes('<simulations>')) expect(out.indexOf('<datatypes>')).toBeLessThan(out.indexOf('<simulations>'));
  });

  it('writes nothing for a design without any', () => {
    expect(exportOrk({ name: 'X', tree: importOrk(ork('')).tree })).not.toContain('datatypes');
  });
});
