import { describe, expect, it } from 'vitest';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import { autoFinTab, canAutoFinTab } from '../../../src/services/design/finTabAuto';
import { kernelLength } from '../../../src/tree/kernelDefaults';

// Dimensions in meters.

const node = (o: Record<string, unknown>): ComponentNode => o as unknown as ComponentNode;

const MOUNT_R = 0.0095;
const BODY_R = 0.026;

const fins = (extra: Record<string, unknown> = {}) =>
  node({ id: 'fins', type: 'trapezoidfinset', finCount: 3, rootChord: 0.1, tipChord: 0.05, height: 0.05, ...extra });

const body = (inside: ComponentNode[], fin: ComponentNode = fins(), bodyExtra: Record<string, unknown> = {}) =>
  ({
    name: 'R',
    components: [
      {
        id: 'st',
        type: 'stage',
        children: [
          {
            id: 'tube',
            type: 'bodytube',
            length: 0.3,
            outerRadius: BODY_R,
            thickness: 0.001,
            children: [...inside, fin],
            ...bodyExtra,
          },
        ],
      },
    ],
  }) as unknown as RocketTree;

const mount = (extra: Record<string, unknown> = {}) =>
  node({
    id: 'mount',
    type: 'innertube',
    length: 0.2,
    outerRadius: MOUNT_R,
    position: { method: 'bottom', offset: 0 },
    ...extra,
  });

const ring = (id: string, offset: number, thickness = 0.003, outerRadius = 0.025) =>
  node({ id, type: 'centeringring', length: thickness, outerRadius, position: { method: 'top', offset } });

const tab = (tree: RocketTree) => autoFinTab(tree, 'fins')!;

describe('when it is offered at all', () => {
  const tube = node({ type: 'bodytube' });
  it('is offered for a planar fin set on a symmetric body', () => {
    expect(canAutoFinTab(fins(), tube)).toBe(true);
    expect(canAutoFinTab(node({ type: 'freeformfinset' }), tube)).toBe(true);
    expect(canAutoFinTab(fins(), node({ type: 'nosecone' }))).toBe(true);
  });

  it('is not offered for tube fins, which have no tab, or with no parent', () => {
    expect(canAutoFinTab(node({ type: 'tubefinset' }), tube)).toBe(false);
    expect(canAutoFinTab(fins(), null)).toBe(false);
    expect(canAutoFinTab(fins(), node({ type: 'podset' }))).toBe(false);
  });
});

describe('a parent with no length of its own', () => {
  it('places the fin against the kernel default length', () => {
    const bottomFin = fins({ position: { method: 'bottom', offset: 0 } });
    const L = kernelLength('bodytube')!;
    const inside = [mount(), ring('r1', L - 0.05)];
    const keyless = body(inside, bottomFin, { length: undefined });
    const explicit = body(inside, bottomFin, { length: L });
    const t = autoFinTab(keyless, 'fins')!;
    expect(t).toEqual(autoFinTab(explicit, 'fins'));
    expect(t['tabLength']).toBeCloseTo(0.05 - 0.003, 12);
  });
});

describe('the depth of the tab', () => {
  it('reaches from the body down to the motor mount', () => {
    expect(tab(body([mount()]))['tabHeight']).toBeCloseTo(BODY_R - MOUNT_R, 12);
  });

  it('is the whole body radius when there is no mount tube under the fin', () => {
    expect(tab(body([]))['tabHeight']).toBeCloseTo(BODY_R, 12);
  });

  it('ignores a mount tube that does not reach under the fin', () => {
    const forward = mount({ length: 0.04, position: { method: 'top', offset: 0 } });
    expect(tab(body([forward], fins({ position: { method: 'bottom', offset: 0 } })))['tabHeight']).toBeCloseTo(
      BODY_R,
      12,
    );
  });

  it('takes the NARROWER end of a tapering body, not the wider one', () => {
    const boat = {
      name: 'R',
      components: [
        {
          id: 'st',
          type: 'stage',
          children: [
            {
              id: 'tr',
              type: 'transition',
              shape: 'conical',
              length: 0.2,
              foreRadius: BODY_R,
              aftRadius: 0.016,
              children: [
                mount({ length: 0.2, position: { method: 'top', offset: 0 } }),
                fins({ position: { method: 'top', offset: 0.05 } }),
              ],
            },
          ],
        },
      ],
    } as unknown as RocketTree;
    expect(tab(boat)['tabHeight']).toBeCloseTo(0.0185 - MOUNT_R, 6);
  });
});

describe('the depth of the tab over a cluster or an offset mount', () => {
  const height = (inside: ComponentNode[], fin = fins()) => tab(body(inside, fin))['tabHeight'] as number;

  it('stops at the outer edge of a cluster tube under the fin', () => {
    const four = mount({ cluster: '4-ring', clusterRotation: Math.PI / 4 });
    const centerOut = Math.SQRT2 * MOUNT_R;
    expect(height([four], fins({ finCount: 4 }))).toBeCloseTo(BODY_R - (centerOut + MOUNT_R), 9);
  });

  it('goes past a cluster whose tubes all sit between the fins', () => {
    const four = mount({ cluster: '4-ring', clusterScale: 1.2 });
    expect(height([four], fins({ finCount: 4, thickness: 0.001 }))).toBeCloseTo(BODY_R, 9);
  });

  it('counts the tab thickness: a tube just beside the fin line still stops it', () => {
    const off = mount({ radialPosition: Math.hypot(0.015, 0.01), radialDirection: Math.atan2(0.01, 0.015) });
    const gap = 0.01 - 0.0015;
    const top = 0.015 + Math.sqrt(MOUNT_R * MOUNT_R - gap * gap);
    expect(height([off], fins({ thickness: 0.003 }))).toBeCloseTo(BODY_R - top, 9);
    expect(height([off], fins({ thickness: 0.0001 }))).toBeCloseTo(BODY_R, 9);
  });
});

describe('where the tab sits along the root', () => {
  it('is the whole root chord when no ring is in the way', () => {
    const t = tab(body([mount()], fins({ position: { method: 'top', offset: 0.1 } })));
    expect(t['tabOffsetMethod']).toBe('top');
    expect(t['tabOffset']).toBe(0);
    expect(t['tabLength']).toBeCloseTo(0.1, 12);
  });

  it('runs between two rings that bracket the fin root', () => {
    const t = tab(
      body([mount(), ring('r1', 0.1), ring('r2', 0.19)], fins({ position: { method: 'top', offset: 0.1 } })),
    );
    expect(t['tabOffset']).toBeCloseTo(0.003, 12);
    expect(t['tabLength']).toBeCloseTo(0.19 - 0.103, 12);
  });

  it('stops at the trailing edge when the aft ring is past it', () => {
    const t = tab(
      body([mount(), ring('r1', 0.1), ring('r2', 0.25)], fins({ position: { method: 'top', offset: 0.1 } })),
    );
    expect(t['tabOffset']).toBeCloseTo(0.003, 12);
    expect(t['tabLength']).toBeCloseTo(0.2 - 0.103, 12);
  });

  it('starts at the leading edge when the forward ring is ahead of the root', () => {
    const t = tab(
      body([mount(), ring('r1', 0.05), ring('r2', 0.15)], fins({ position: { method: 'top', offset: 0.1 } })),
    );
    expect(t['tabOffset']).toBe(0);
    expect(t['tabLength']).toBeCloseTo(0.05, 12);
  });

  it('treats two rings glued face to face as one obstruction', () => {
    const t = tab(
      body(
        [mount(), ring('r1', 0.1), ring('r2', 0.103), ring('r3', 0.19)],
        fins({ position: { method: 'top', offset: 0.1 } }),
      ),
    );
    expect(t['tabOffset']).toBeCloseTo(0.006, 12);
    expect(t['tabLength']).toBeCloseTo(0.19 - 0.106, 12);
  });

  it('ignores a ring no wider than the tube it centers', () => {
    const flush = ring('r1', 0.15, 0.003, MOUNT_R);
    const t = tab(body([mount(), flush], fins({ position: { method: 'top', offset: 0.1 } })));
    expect(t['tabOffset']).toBe(0);
    expect(t['tabLength']).toBeCloseTo(0.1, 12);
  });

  it('never returns a negative length', () => {
    const t = tab(
      body(
        [mount(), ring('r1', 0.09, 0.02), ring('r2', 0.1, 0.02)],
        fins({ position: { method: 'top', offset: 0.1 } }),
      ),
    );
    expect(t['tabLength'] as number).toBeGreaterThanOrEqual(0);
  });
});

describe('a fin placed from the aft end or the middle', () => {
  const inside = () => [mount(), ring('fwd', 0.1), ring('aft', 0.297)];
  const atTop = tab(body(inside(), fins({ position: { method: 'top', offset: 0.2 } })));
  const sameTab = (got: Record<string, unknown>) => {
    expect(got['tabOffsetMethod']).toBe('top');
    for (const k of ['tabHeight', 'tabOffset', 'tabLength']) {
      expect(got[k] as number).toBeCloseTo(atTop[k] as number, 12);
    }
  };

  it('finds the leading edge one root chord ahead of the aft end', () => {
    const atBottom = tab(body(inside(), fins({ position: { method: 'bottom', offset: 0 } })));
    sameTab(atBottom);
    expect(atBottom['tabHeight']).toBeCloseTo(BODY_R - MOUNT_R, 12);
    expect(atBottom['tabOffset']).toBeCloseTo(0, 12);
    expect(atBottom['tabLength']).toBeCloseTo(0.097, 12);
  });

  it('finds the leading edge half a root chord ahead of the middle', () => {
    const atMiddle = tab(body(inside(), fins({ position: { method: 'middle', offset: 0.1 } })));
    sameTab(atMiddle);
    expect(atMiddle['tabHeight']).toBeCloseTo(BODY_R - MOUNT_R, 12);
  });
});

describe('when there is nothing to compute', () => {
  it('answers null for a fin set on a pod rather than a body', () => {
    const t = {
      name: 'R',
      components: [{ id: 'st', type: 'stage', children: [{ id: 'pod', type: 'podset', children: [fins()] }] }],
    } as unknown as RocketTree;
    expect(autoFinTab(t, 'fins')).toBeNull();
  });

  it('answers null for a part that is not there', () => {
    expect(autoFinTab(body([mount()]), 'nope')).toBeNull();
  });
});
