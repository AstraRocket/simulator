import { describe, it, expect, beforeEach } from 'vitest';
import type { ComponentNode, StaticInfo } from '../../../src/engine/openRocketEngine';
import { stageParts, finSetPositions, restoringEngine } from '../../../src/services/report/reportModel';
import { KERNEL_DEFAULTS } from '../../../src/tree/kernelDefaults';
import { motorSpecs, newFlightConfig } from '../../../src/services/flight/flightConfigs';

const node = (o: object): ComponentNode => o as unknown as ComponentNode;

const stage = node({
  type: 'stage',
  name: 'Sustainer',
  children: [
    node({ type: 'nosecone', id: 'nose', name: 'Nose', length: 0.1, outerRadius: 0.012 }),
    node({
      type: 'bodytube',
      id: 'body',
      name: 'Body',
      length: 0.2,
      outerRadius: 0.012,
      thickness: 0.0005,
      children: [node({ type: 'trapezoidfinset', id: 'fins', name: 'Fins', rootChord: 0.05 })],
    }),
  ],
});

const rocket = {
  componentInfo: (id: string) => {
    const mass: Record<string, number> = { nose: 0.01, body: 0.02, fins: 0.005 };
    const posX: Record<string, number> = { fins: 0.25 };
    if (!(id in mass) && !(id in posX)) throw new Error(`no such component ${id}`);
    return { mass: mass[id] ?? 0, positionX: posX[id] ?? 0 };
  },
};

describe('stageParts', () => {
  const rows = stageParts(stage, rocket);

  it('walks the stage subtree, excluding the stage node itself', () => {
    expect(rows.map((r) => r.type)).toEqual(['nosecone', 'bodytube', 'trapezoidfinset']);
  });
  it('indents nested parts by one depth level', () => {
    expect(rows.find((r) => r.type === 'bodytube')!.depth).toBe(0);
    expect(rows.find((r) => r.type === 'trapezoidfinset')!.depth).toBe(1);
  });
  it('pulls each part mass from the engine handle', () => {
    expect(rows.find((r) => r.name === 'Nose')!.mass).toBeCloseTo(0.01, 9);
    expect(rows.find((r) => r.name === 'Fins')!.mass).toBeCloseTo(0.005, 9);
  });
  it('gives a nose cone its base diameter, a transition its two ends and a tube its bore', () => {
    const s = node({
      type: 'stage',
      children: [
        node({ type: 'nosecone', name: 'N', aftRadius: 0.02 }),
        node({ type: 'transition', name: 'T', foreRadius: 0.02, aftRadius: 0.015 }),
        node({ type: 'bodytube', name: 'B', outerRadius: 0.015, thickness: 0.001 }),
      ],
    });
    const [nose, transition, tube] = stageParts(s, rocket);
    expect(nose!.outerR).toBeCloseTo(0.02, 12);
    expect([transition!.foreR, transition!.aftR]).toEqual([0.02, 0.015]);
    expect(tube!.innerR).toBeCloseTo(0.014, 12);
  });
  it('lists no bore or wall for a filled tube, which flies solid', () => {
    const s = node({
      type: 'stage',
      children: [node({ type: 'bodytube', name: 'Rod', outerRadius: 0.01, thickness: 0.001, filled: true })],
    });
    const [rod] = stageParts(s, rocket);
    expect(rod!.outerR).toBeCloseTo(0.01, 12);
    expect(rod!.innerR).toBeUndefined();
    expect(rod!.thickness).toBeUndefined();
  });
  it('gives a fin set its root chord as its length, and its span', () => {
    const fins = rows.find((r) => r.type === 'trapezoidfinset')!;
    expect(fins.length).toBeCloseTo(0.05, 12);
    expect(fins.span).toBeCloseTo(0.03, 12);
  });
  it('gives a part with no length the length the bridge builds it with, not 0', () => {
    const s = node({ type: 'stage', children: [node({ type: 'bodytube', name: 'B', outerRadius: 0.012 })] });
    expect(stageParts(s, rocket)[0]!.length).toBeCloseTo(KERNEL_DEFAULTS.bodytube.length, 12);
  });
  it('leaves mass 0 for a part the engine cannot weigh (no id / throw)', () => {
    const s = node({ type: 'stage', children: [node({ type: 'masscomponent', name: 'Ballast' })] });
    expect(stageParts(s, rocket)[0]!.mass).toBe(0);
  });
});

describe('finSetPositions', () => {
  it('spans a swept freeform fin by its ROOT chord, not its aftmost point', () => {
    const swept = node({
      type: 'stage',
      children: [
        node({
          type: 'bodytube',
          id: 'body',
          length: 0.2,
          outerRadius: 0.012,
          children: [
            node({
              type: 'freeformfinset',
              id: 'fins',
              name: 'Swept',
              points: [
                [0, 0],
                [0.04, 0.05],
                [0.09, 0.05],
                [0.06, 0],
              ],
            }),
          ],
        }),
      ],
    });
    const sets = finSetPositions(swept, rocket);
    expect(sets).toHaveLength(1);
    expect(sets[0]!.bottomX - sets[0]!.topX).toBeCloseTo(0.06, 9);
  });

  it('spans a fin from its root leading edge to leading+rootChord', () => {
    const sets = finSetPositions(stage, rocket);
    expect(sets).toHaveLength(1);
    expect(sets[0]!.name).toBe('Fins');
    expect(sets[0]!.topX).toBeCloseTo(0.25, 9);
    expect(sets[0]!.bottomX).toBeCloseTo(0.3, 9);
  });
  // FreeformFinSet.length = last.x - first.x (0.04), not the outline's 0.06.
  it('uses a freeform fin ROOT chord, not the outline max-x, as the root length', () => {
    const s = node({
      type: 'stage',
      children: [
        node({
          type: 'freeformfinset',
          id: 'fins',
          name: 'FF',
          points: [
            [0, 0],
            [0.06, 0.03],
            [0.04, 0],
          ],
        }),
      ],
    });
    const r = { componentInfo: () => ({ positionX: 0.1 }) };
    expect(finSetPositions(s, r)[0]!.bottomX).toBeCloseTo(0.14, 9);
  });
  it('skips a fin set with no id, and one the engine cannot locate', () => {
    const s = node({
      type: 'stage',
      children: [
        node({ type: 'trapezoidfinset', name: 'no-id', rootChord: 0.05 }),
        node({ type: 'trapezoidfinset', id: 'ghost', name: 'ghost', rootChord: 0.05 }),
      ],
    });
    expect(finSetPositions(s, rocket)).toHaveLength(0);
  });
});

describe('restoringEngine', () => {
  const stages = [node({ type: 'stage', name: 'A' }), node({ type: 'stage', name: 'B' })];
  const info = (mass: number) => ({ mass }) as unknown as StaticInfo;
  const whole = { info: info(99), handle: {} as never };
  let failures: unknown[] = [];
  const failed = (e: unknown) => failures.push(e);
  beforeEach(() => {
    failures = [];
  });
  const perStage = (buildStage: (st: ComponentNode) => StaticInfo) => () =>
    stages.map((st) => ({ label: st.name as string, info: buildStage(st) }));

  it('returns the work and restores the whole-rocket handle once', () => {
    const restored: unknown[] = [];
    const out = restoringEngine(
      perStage((st) => info(st.name === 'A' ? 1 : 2)),
      () => true,
      () => whole,
      (b) => restored.push(b),
      failed,
    );
    expect(out.map((sm) => sm.label)).toEqual(['A', 'B']);
    expect(out.map((sm) => (sm.info as unknown as { mass: number }).mass)).toEqual([1, 2]);
    expect(restored).toEqual([whole]);
  });

  it('leaves the live handle alone when the work built nothing', () => {
    const restored: unknown[] = [];
    let wholeBuilds = 0;
    const out = restoringEngine(
      () => 'no builds',
      () => false,
      () => {
        wholeBuilds++;
        return whole;
      },
      (b) => restored.push(b),
      failed,
    );
    expect(out).toBe('no builds');
    expect(wholeBuilds).toBe(0);
    expect(restored).toEqual([]);
  });

  it('still restores the live handle when a build throws (finally)', () => {
    const restored: unknown[] = [];
    expect(() =>
      restoringEngine(
        perStage((st) => {
          if (st.name === 'B') throw new Error('bad stage');
          return info(1);
        }),
        () => true,
        () => whole,
        (b) => restored.push(b),
        failed,
      ),
    ).toThrow(/bad stage/);
    expect(restored).toEqual([whole]);
    expect(failures).toEqual([]);
  });

  it('reports a failing whole-rocket rebuild instead of silently not restoring', () => {
    const restored: unknown[] = [];
    const out = restoringEngine(
      perStage(() => info(1)),
      () => true,
      () => {
        throw new Error('whole rebuild failed');
      },
      (b) => restored.push(b),
      failed,
    );
    expect(out.map((sm) => sm.label)).toEqual(['A', 'B']);
    expect(restored).toEqual([]);
    expect(failures).toHaveLength(1);
    expect((failures[0] as Error).message).toMatch(/whole rebuild failed/);
  });

  it('keeps the build failure when BOTH throw, rather than replacing it', () => {
    expect(() =>
      restoringEngine(
        perStage(() => {
          throw new Error('bad stage');
        }),
        () => true,
        () => {
          throw new Error('whole rebuild failed');
        },
        () => {},
        failed,
      ),
    ).toThrow(/bad stage/);
    expect(failures).toHaveLength(1);
  });
});

describe('finSetPositions: tube fins', () => {
  const rocket = { componentInfo: () => ({ positionX: 0.42 }) };
  const withTubes = (over: Record<string, unknown> = {}) =>
    node({
      type: 'stage',
      children: [
        node({
          type: 'bodytube',
          id: 'b',
          children: [node({ type: 'tubefinset', id: 'tf', name: 'Tube fins', length: 0.08, ...over })],
        }),
      ],
    });

  it('spans a tube fin by its LENGTH, not a rootChord it does not have', () => {
    const sets = finSetPositions(withTubes(), rocket);
    expect(sets).toHaveLength(1);
    expect(sets[0]!.name).toBe('Tube fins');
    expect(sets[0]!.topX).toBeCloseTo(0.42, 9);
    expect(sets[0]!.bottomX).toBeCloseTo(0.5, 9);
    expect(sets[0]!.bottomX).not.toBeCloseTo(0.47, 6);
  });

  it('ignores a rootChord even when one is present on the node', () => {
    const sets = finSetPositions(withTubes({ rootChord: 0.2 }), rocket);
    expect(sets[0]!.bottomX).toBeCloseTo(0.5, 9);
  });
});

describe('per-stage motors', () => {
  const tree = (id: string) =>
    ({
      name: 'R',
      components: [node({ type: 'stage', children: [node({ type: 'bodytube', id, motorMount: true })] })],
    }) as never;

  const spec = (designation: string) => ({ designation }) as never;
  const config = newFlightConfig({
    sustainerMount: { spec: spec('SUSTAINER-K550') },
    boosterMount: { spec: spec('BOOSTER-M1350') },
  });

  it('gives each stage the motor in its own mount', () => {
    expect(motorSpecs(tree('sustainerMount'), config)[0]?.designation).toBe('SUSTAINER-K550');
    expect(motorSpecs(tree('boosterMount'), config)[0]?.designation).toBe('BOOSTER-M1350');
  });

  it('seats nothing in a stage whose mount holds no motor', () => {
    expect(motorSpecs(tree('emptyMount'), config)).toEqual([]);
  });

  it('seats nothing in a stage with no mount at all', () => {
    const noMount = { name: 'R', components: [node({ type: 'stage', children: [node({ type: 'bodytube' })] })] };
    expect(motorSpecs(noMount as never, config)).toEqual([]);
  });
});
