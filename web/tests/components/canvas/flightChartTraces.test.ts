import { describe, it, expect } from 'vitest';
import type { ChartFlight } from '../../../src/components/canvas/FlightChart';
import {
  SERIES,
  buildTraces,
  extraSeries,
  pairKey,
  pairSeries,
  panelSeries,
  traceLabel,
  traceOffset,
  traceScale,
  traceUnit,
  visibleSeries,
} from '../../../src/components/canvas/flightChartTraces';
import type { FlightResult, FlightSeries } from '../../../src/engine/openRocketEngine';

const series = (time: number[]) => ({ time, altitude: time.map((t) => t) }) as unknown as FlightSeries;

const flight = (id: string, name: string, stages?: string[]): ChartFlight => ({
  id,
  name,
  result: {
    summary: { flightTime: 10 },
    events: [{ type: 'APOGEE', time: 5 }],
    series: series([0, 1, 2]),
    branches: stages?.map((s) => ({ name: s, events: [], series: series([0, 1, 2]) })),
  } as unknown as FlightResult,
});

const stageLabel = (i: number, name?: string) => name || `Stage ${i + 1}`;

describe('buildTraces', () => {
  it('collapses an unstaged flight to one line', () => {
    const [only, ...rest] = buildTraces(flight('a', 'Simulation 1'), stageLabel);
    expect(rest).toEqual([]);
    expect(only!.name).toBe('Stage 1');
    expect(only!.color).toBe('var(--c-series-1)');
  });

  it('gives each stage its own name and color', () => {
    const traces = buildTraces(flight('a', 'Simulation 1', ['Sustainer', 'Booster']), stageLabel);
    expect(traces.map((x) => x.name)).toEqual(['Sustainer', 'Booster']);
    expect(traces[0]!.color).not.toBe(traces[1]!.color);
  });

  it('falls back to a numbered stage when the engine did not name the branch', () => {
    const traces = buildTraces(flight('a', 'Simulation 1', ['', '']), stageLabel);
    expect(traces.map((x) => x.name)).toEqual(['Stage 1', 'Stage 2']);
  });

  it('keys a trace by its flight as well as its branch', () => {
    const a = buildTraces(flight('a', 'C6', ['S', 'B']), stageLabel).map((x) => x.key);
    const b = buildTraces(flight('b', 'D12', ['S', 'B']), stageLabel).map((x) => x.key);
    expect(new Set([...a, ...b]).size).toBe(4);
  });

  it('draws nothing at all when there is no flight', () => {
    expect(buildTraces(null, stageLabel)).toEqual([]);
  });
});

describe('visibleSeries', () => {
  it('keeps the keys it knows', () => {
    expect(visibleSeries(['altitude', 'thrust'])).toEqual(['altitude', 'thrust']);
  });

  it('draws nothing for a key this build does not have', () => {
    expect(visibleSeries(['altitude', 'sideslip', 'mach'])).toEqual(['altitude', 'mach']);
  });

  it('returns the panels in chart order, not the order they were saved in', () => {
    expect(visibleSeries(['mach', 'altitude'])).toEqual(['altitude', 'mach']);
  });

  it('allows an empty choice, which is every panel closed', () => {
    expect(visibleSeries([])).toEqual([]);
  });

  it('ignores a duplicate rather than drawing the panel twice', () => {
    expect(visibleSeries(['altitude', 'altitude'])).toEqual(['altitude']);
  });
});

describe('the derived panels', () => {
  it('ride on each line as series of their own', () => {
    const s = {
      time: [0, 1],
      altitude: [0, 10],
      velocity: [0, 20],
      mach: [0, 0.1],
      aoa: [0, 0.2],
      ρ: [1.2, 1.2],
      Vs: [340, 340],
      dΦ: [0, 3],
    } as unknown as FlightSeries;
    const [line] = buildTraces(
      { id: 'a', name: 'A', result: { summary: { flightTime: 1 }, events: [], series: s } as unknown as FlightResult },
      stageLabel,
    );
    const q = 0.5 * 1.2 * 34 * 34;
    expect(line!.series.dynamicPressure).toEqual([0, q]);
    expect(line!.series.qAlpha![1]).toBeCloseTo(q * 0.2, 9);
    expect(line!.series.rollRate).toEqual([0, 3]);
  });

  it('leaves them absent when the run lacks their inputs', () => {
    const [line] = buildTraces(flight('a', 'A'), stageLabel);
    expect(line!.series.dynamicPressure).toBeUndefined();
    expect(line!.series.rollRate).toBeUndefined();
  });

  it('can be chosen like any other panel', () => {
    expect(visibleSeries(['velocityAltitude', 'rollRate', 'qAlpha', 'dynamicPressure'])).toEqual([
      'dynamicPressure',
      'qAlpha',
      'rollRate',
      'velocityAltitude',
    ]);
  });
});

describe('a product series', () => {
  it('takes its scale and label from both preferences', () => {
    const qa = SERIES.find((m) => m.key === 'qAlpha')!;
    const factors: Record<string, number> = { pressure: 1 / 6894.75729, angle: 180 / Math.PI };
    const symbols: Record<string, string> = { pressure: 'psi', angle: '°' };
    const u = { factor: (q: string) => factors[q]!, sym: (q: string) => symbols[q]! };
    expect(traceScale(qa, u as never)).toBeCloseTo(180 / Math.PI / 6894.75729, 12);
    expect(traceUnit(qa, u as never, (k) => k)).toBe('psi·°');
  });
});

describe('the stability panel', () => {
  it('labels calibers with the translated word, as the rest of the app does', () => {
    const stability = SERIES.find((m) => m.key === 'stability')!;
    const u = { sym: () => '' };
    expect(traceUnit(stability, u as never, (k) => (k === 'stability.caliber' ? 'kal' : k))).toBe('kal');
  });
});

describe('the added panels', () => {
  const lines = (s: Record<string, unknown>) =>
    buildTraces(
      {
        id: 'f',
        name: 'F',
        result: { summary: { flightTime: 2 }, events: [], series: { time: [0, 1, 2], ...s } },
      } as unknown as ChartFlight,
      stageLabel,
    );

  it('offers what the run recorded beyond the built-in panels, in catalog order', () => {
    const extras = extraSeries(lines({ altitude: [0, 1, 2], Cd: [0.5, 0.6, 0.7], Vz: [0, 1, 0] }));
    expect(extras.map((m) => m.key)).toEqual(['Vz', 'Cd']);
    const vz = extras[0]!;
    expect(vz.label).toBe('flightVar.Vz');
    expect(vz.quantity).toBe('velocity');
    expect(vz.literal).toBeFalsy();
  });

  it('names a symbol the app does not know by the symbol itself, after the named ones', () => {
    const extras = extraSeries(lines({ zz: [1, 2, 3], Cd: [0.5, 0.6, 0.7] }));
    expect(extras.map((m) => m.key)).toEqual(['Cd', 'zz']);
    expect(traceLabel(extras[1]!, () => 'translated')).toBe('zz');
    expect(traceLabel(extras[0]!, (k) => `t:${k}`)).toBe('t:flightVar.Cd');
  });

  it('does not offer a series with nothing finite in it', () => {
    expect(extraSeries(lines({ Cd: [null, null, null] })).map((m) => m.key)).toEqual([]);
  });

  it('draws an added panel only for a flight that recorded it', () => {
    const extras = extraSeries(lines({ Cd: [0.5, 0.6, 0.7] }));
    expect(visibleSeries(['altitude', 'Cd', 'Vz'], [...SERIES, ...extras])).toEqual(['altitude', 'Cd']);
  });
});

describe('a temperature panel', () => {
  it('adds the offset a scale alone would drop', () => {
    const t = { key: 'T', label: 'flightVar.T', unit: '', digits: 2, quantity: 'temperature' } as const;
    const u = { factor: () => 1, toUi: (_q: string, si: number) => si - 273.15 };
    const { list } = panelSeries(
      [{ key: 'b', name: 'b', color: '#000', events: [], series: { time: [0], T: [288.15] } } as never],
      t,
      traceScale(t, u as never),
      Infinity,
      traceOffset(t, u as never),
    );
    expect(list[0]!.ys[0]).toBeCloseTo(15, 9);
  });
});

describe('the pairs', () => {
  const plain = SERIES.filter((m) => !m.xy);

  it('builds a panel for a saved pair whose two series the flight has', () => {
    const [pair] = pairSeries(['altitude', 'xy:drag:mach'], plain);
    expect(pair!.key).toBe('xy:drag:mach');
    expect(pair!.xy!.y.key).toBe('drag');
    expect(pair!.xy!.x.key).toBe('mach');
  });

  it('leaves out a pair naming a series this flight lacks, or one series twice', () => {
    expect(pairSeries(['xy:Cd:mach', 'xy:mach:mach', 'xy:bad'], plain)).toEqual([]);
  });

  it('keeps velocity over altitude under its built-in key', () => {
    expect(pairKey('velocity', 'altitude')).toBe('velocityAltitude');
    expect(pairKey('altitude', 'velocity')).toBe('xy:altitude:velocity');
  });

  it('names a pair from its two series, in the reader’s words', () => {
    const [pair] = pairSeries(['xy:drag:mach'], plain);
    const t = (k: string, v?: Record<string, string>) => (v ? `${v.y} / ${v.x}` : `t:${k}`);
    expect(traceLabel(pair!, t)).toBe('t:flight.drag / t:flight.mach');
  });
});
