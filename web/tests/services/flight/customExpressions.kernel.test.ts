import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  __setEngineForTests,
  checkExpressions,
  OpenRocketDesign,
  type RocketTree,
} from '../../../src/engine/openRocketEngine';
import { C6 } from '../../../src/engine/api';
import type { CustomExpression } from '../../../src/services/flight/customExpressions';
import {
  appliesLate,
  EXPRESSION_FUNCTIONS,
  EXPRESSION_VARIABLES,
} from '../../../src/services/flight/expressionVocabulary';
import { loadEngine } from '../../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

beforeAll(async () => {
  __setEngineForTests(await loadEngine());
});
afterAll(() => __setEngineForTests(null));

const expr = (symbol: string, expression: string, name = symbol): CustomExpression => ({
  name,
  symbol,
  unit: '',
  expression,
});

const tree: RocketTree = {
  components: [
    {
      type: 'stage',
      id: 's',
      children: [
        { type: 'nosecone', id: 'n', length: 0.1, aftRadius: 0.012, thickness: 0.002 },
        {
          type: 'bodytube',
          id: 'body',
          length: 0.45,
          outerRadius: 0.012,
          thickness: 0.0005,
          density: 950,
          motorMount: true,
          children: [
            {
              type: 'trapezoidfinset',
              id: 'f',
              finCount: 3,
              rootChord: 0.05,
              tipChord: 0.03,
              sweep: 0.02,
              height: 0.025,
              thickness: 0.003,
            },
            { type: 'parachute', id: 'p', diameter: 0.3 },
          ],
        },
      ],
    },
  ],
};

const fly = (expressions?: CustomExpression[], series: 'summary' | 'full' = 'full') => {
  const design = OpenRocketDesign.buildTree(tree);
  design.setMotorById('body', C6);
  return design.simulate({ expressions, series });
};

describe('the vocabulary', () => {
  it('names only variables the engine reads', () => {
    const list = EXPRESSION_VARIABLES.map((v, i) => expr(`V${'x'.repeat(i + 1)}`, v.symbol));
    const bad = checkExpressions(list).flatMap((f, i) => (f.expression ? [list[i]!.expression] : []));
    expect(bad).toEqual([]);
  });

  it('records a value for every variable it names', () => {
    const { series } = fly(EXPRESSION_VARIABLES.map((v, i) => expr(`V${'x'.repeat(i + 1)}`, v.symbol)));
    const never = EXPRESSION_VARIABLES.filter((_, i) => !series[`$V${'x'.repeat(i + 1)}`]?.some((x) => x !== null));
    expect(never.map((v) => v.symbol)).toEqual([]);
  });

  it('inserts calls the engine computes once their values are filled in', () => {
    const filled = EXPRESSION_FUNCTIONS.map((f, i) =>
      expr(`F${'x'.repeat(i + 1)}`, f.insert.replace('|', 'h').replaceAll(',', ',1')),
    );
    const bad = checkExpressions(filled).flatMap((f, i) => (f.expression ? [filled[i]!.expression] : []));
    expect(bad).toEqual([]);
  });
});

describe('a flight with expressions', () => {
  it('records them by symbol, whatever the app calls its own series', () => {
    const plain = fly();
    const r = fly([expr('mass', '2*m'), expr('KE', '0.5*m*Vt^2')]);
    expect(r.series.mass).toEqual(plain.series.mass);
    r.series['$mass']!.forEach((v, i) => expect(v).toBeCloseTo(2 * r.series.mass[i]!, 12));
    r.series['$KE']!.forEach((v, i) => expect(v).toBeCloseTo(0.5 * r.series.mass[i]! * r.series.velocity[i]! ** 2, 9));
    expect(r.expressions?.map((e) => e.symbol)).toEqual(['mass', 'KE']);
  });

  it('is the same flight', () => {
    const plain = fly();
    const r = fly([expr('KE', '0.5*m*Vt^2'), expr('MA', 'mean(At[0:t])')]);
    expect(r.summary).toEqual(plain.summary);
    expect(r.series.altitude).toEqual(plain.series.altitude);
  });

  it('records them in a summary run too, and drops the ones it cannot', () => {
    const r = fly([expr('KE', '0.5*m*Vt^2'), expr('BAD', 'nope'), expr('KE', 'm')], 'summary');
    expect(Object.keys(r.series).filter((k) => k.startsWith('$'))).toEqual(['$KE']);
    expect(r.expressions?.map((e) => e.symbol)).toEqual(['KE']);
  });

  it('leaves nothing for the next flight', () => {
    fly([expr('KE', '0.5*m*Vt^2')]);
    const r = fly();
    expect(Object.keys(r.series).filter((k) => k.startsWith('$'))).toEqual([]);
    expect(r.expressions).toBeUndefined();
  });

  it('applies lclip and its like late, where the editor says so, and not in parentheses', () => {
    const { series } = fly([expr('LATE', 'lclip(h,5)+1'), expr('FIRST', '(lclip(h,5))+1')]);
    expect(appliesLate('lclip(h,5)+1')).toBe(true);
    expect(appliesLate('(lclip(h,5))+1')).toBe(false);
    series.altitude.forEach((h, i) => {
      expect(series['$LATE']![i]).toBe(Math.max(h, 6));
      expect(series['$FIRST']![i]).toBe(Math.max(h, 5) + 1);
    });
  });
});

describe('what is wrong with an expression', () => {
  it('is said of its symbol and of its formula', () => {
    expect(
      checkExpressions([
        expr('h', 'm'),
        expr('sin', 'm'),
        expr('a1', 'm'),
        expr('OK', '{m'),
        expr('LO', 'LATER'),
        expr('LATER', 'OK*2'),
      ]),
    ).toEqual([
      { symbol: 'taken', expression: null },
      { symbol: 'function', expression: null },
      { symbol: 'characters', expression: null },
      { symbol: null, expression: 'characters' },
      { symbol: null, expression: 'formula' },
      { symbol: null, expression: null },
    ]);
  });
});
