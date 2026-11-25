import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { FlightResult, RocketTree } from '../../../src/engine/openRocketEngine';
import { buildPieces } from '../../../src/components/canvas/rocketPieces';
import { flightBodies } from '../../../src/services/flight/flightBodies';
import { burnLevel, deployments, flightPops, mountBurns } from '../../../src/services/flight/flightSources';
import { flyTwoStage, TWO_STAGE } from '../../testing/twoStageFlight';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

const tree = TWO_STAGE as unknown as RocketTree;

let result: FlightResult;
beforeAll(async () => {
  result = await flyTwoStage();
});

/** As read from a file. */
const unsourced = (): FlightResult => ({
  ...result,
  branches: result.branches!.map((b) => ({ ...b, events: b.events.map(({ sourceId: _id, ...e }) => e) })),
});

const burnsOf = (r: FlightResult) => {
  const bodies = flightBodies(tree, r);
  return { bodies, burns: new Map(mountBurns(tree, bodies).map((b) => [b.mountId, b])) };
};

describe('the burns of a two-stage flight', () => {
  it('finds each on the body that carries its mount', () => {
    const { burns } = burnsOf(result);
    expect(burns.get('booster-mount')).toMatchObject({ body: 1, from: 0, to: 2 });
    expect(burns.get('sustainer-mount')).toMatchObject({ body: 0, from: 3, to: 5 });
  });

  it('finds them by name in a result read from a file, the lower of two namesakes first', () => {
    const { burns } = burnsOf(unsourced());
    expect(burns.get('booster-mount')).toMatchObject({ body: 1, from: 0, to: 2 });
    expect(burns.get('sustainer-mount')).toMatchObject({ body: 0, from: 3, to: 5 });
  });

  it('follows the recorded thrust, and is out before and after', () => {
    const { bodies, burns } = burnsOf(result);
    const booster = burns.get('booster-mount')!;
    expect(burnLevel(booster, bodies, 0)).toBe(0);
    expect(burnLevel(booster, bodies, 0.1)).toBeGreaterThan(1.8);
    expect(burnLevel(booster, bodies, 1)).toBeCloseTo(4.9 / booster.parts[0]!.average, 1);
    expect(burnLevel(booster, bodies, 2)).toBe(0);
    expect(burnLevel(burns.get('sustainer-mount')!, bodies, 1)).toBe(0);
  });

  it('burns evenly where a run records no thrust', () => {
    const bare = result.branches!.map((b) => ({ ...b, series: { ...b.series, thrust: [] } }));
    const { bodies, burns } = burnsOf({ ...result, branches: bare });
    expect(burnLevel(burns.get('booster-mount')!, bodies, 1)).toBe(1);
  });

  it('draws each from the aft end of its mount', () => {
    const at = new Map(buildPieces(tree).nozzles.map((n) => [n.mountId, n.at[0]]));
    expect(at.get('sustainer-mount')).toBeCloseTo(0.37, 6);
    expect(at.get('booster-mount')).toBeCloseTo(0.49, 6);
  });
});

describe('the charges of a two-stage flight', () => {
  it('end each burn’s delay: at once for the booster, 5 s on for the sustainer', () => {
    for (const r of [result, unsourced()]) {
      const { burns } = burnsOf(r);
      expect(burns.get('booster-mount')!.charge).toBeCloseTo(2, 6);
      expect(burns.get('sustainer-mount')!.charge).toBeCloseTo(10, 6);
    }
  });

  it('leave a plugged motor without one', () => {
    const plugged = result.branches!.map((b) => ({
      ...b,
      events: b.events.filter((e) => e.type !== 'EJECTION_CHARGE' || e.sourceId !== 'sus'),
    }));
    const { burns } = burnsOf({ ...result, branches: plugged });
    expect(burns.get('sustainer-mount')!.charge).toBeUndefined();
  });

  it('pop once as the stages part and once at the sustainer’s ejection', () => {
    const pops = flightPops(tree, flightBodies(tree, result));
    expect(pops).toEqual([
      { kind: 'separation', body: 1, time: 2 },
      { kind: 'ejection', body: 0, time: 10 },
    ]);
  });

  it('does not pop for a strap-on letting go', () => {
    const strapped = {
      ...tree,
      components: tree.components.map((c) => (c.id === 'boo' ? { ...c, type: 'parallelstage' } : c)),
    } as unknown as RocketTree;
    const kinds = flightPops(strapped, flightBodies(tree, result)).map((p) => p.kind);
    expect(kinds).not.toContain('separation');
  });
});

describe('the recovery devices of a two-stage flight', () => {
  it('are each out from their own deployment until their own stage lands', () => {
    const bodies = flightBodies(tree, result);
    const [booster, sustainer] = deployments(tree, bodies);
    expect(booster).toMatchObject({ body: 1, from: expect.closeTo(2.001, 3) });
    expect(booster!.device.id).toBe('booster-chute');
    expect(booster!.to).toBeCloseTo(result.branches![1]!.series.time.at(-1)!, 6);
    expect(sustainer).toMatchObject({ body: 0, from: expect.closeTo(10.001, 3) });
    expect(sustainer!.to).toBeGreaterThan(booster!.to);
  });

  it('are found by name in a result read from a file', () => {
    const found = deployments(tree, flightBodies(tree, unsourced()));
    expect(found.map((d) => [d.device.id, d.body])).toEqual([
      ['booster-chute', 1],
      ['sustainer-chute', 0],
    ]);
  });

  it('leave out one that never deployed', () => {
    const quiet = result.branches!.map((b) => ({
      ...b,
      events: b.events.filter((e) => e.sourceId !== 'sustainer-chute'),
    }));
    const found = deployments(tree, flightBodies(tree, { ...result, branches: quiet }));
    expect(found.map((d) => d.device.id)).toEqual(['booster-chute']);
  });
});

describe('the nozzles of a cluster', () => {
  it('are one per tube', () => {
    const { nozzles } = buildPieces({
      name: 'C',
      components: [
        {
          id: 's',
          type: 'stage',
          children: [
            {
              id: 'b',
              type: 'bodytube',
              length: 0.3,
              outerRadius: 0.04,
              children: [
                {
                  id: 'm',
                  type: 'innertube',
                  motorMount: true,
                  length: 0.1,
                  outerRadius: 0.01,
                  cluster: '3-ring',
                  motorOverhang: 0.005,
                  position: { method: 'bottom', offset: 0 },
                },
              ],
            },
          ],
        },
      ],
    } as unknown as RocketTree);
    expect(nozzles.map((n) => n.mountId)).toEqual(['m', 'm', 'm']);
    for (const n of nozzles) expect(n.at[0]).toBeCloseTo(0.305, 6);
    expect(
      new Set(
        nozzles.map((n) =>
          n.at
            .slice(1)
            .map((v) => v.toFixed(5))
            .join(),
        ),
      ).size,
    ).toBe(3);
  });
});
