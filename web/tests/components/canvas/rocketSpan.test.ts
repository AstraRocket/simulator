// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { rocketSpanM } from '../../../src/components/canvas/AftView';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';

/**
 * The span both image exports print: twice the farthest any part reaches from
 * the axis, each measured from the surface it stands on. The 2D view used to
 * add the largest fin span to the largest body radius wherever the fins sat,
 * and the 3D view left launch lugs out, so one rocket printed two spans.
 */

const stage = (children: unknown[]): ComponentNode[] =>
  [{ type: 'stage', id: 'st', children }] as unknown as ComponentNode[];

const FIN = {
  type: 'trapezoidfinset',
  id: 'fins',
  finCount: 3,
  rootChord: 0.05,
  tipChord: 0.03,
  sweep: 0.02,
  height: 0.03,
  thickness: 0.003,
  position: { method: 'bottom', offset: 0 },
};

describe('rocketSpanM', () => {
  it('measures fins from the tube they stand on, not the widest part', () => {
    // A 60 mm payload over a 25 mm finned tube: the fins reach 55 mm, inside
    // the payload's 60.
    const span = rocketSpanM(
      stage([
        { type: 'bodytube', id: 'payload', length: 0.2, outerRadius: 0.06, thickness: 0.002 },
        { type: 'bodytube', id: 'tube', length: 0.3, outerRadius: 0.025, thickness: 0.001, children: [FIN] },
      ]),
    );
    expect(span).toBeCloseTo(0.12, 9);
  });

  it('counts a launch lug standing proud of the body', () => {
    const lug = { type: 'launchlug', id: 'lug', length: 0.03, outerRadius: 0.005, thickness: 0.001 };
    const bare = rocketSpanM(stage([{ type: 'bodytube', id: 't', length: 0.3, outerRadius: 0.025 }]));
    const withLug = rocketSpanM(
      stage([{ type: 'bodytube', id: 't', length: 0.3, outerRadius: 0.025, children: [lug] }]),
    );
    expect(bare).toBeCloseTo(0.05, 9);
    expect(withLug).toBeCloseTo(2 * (0.025 + 0.01), 9);
  });

  it('carries no frame floor for a small rocket', () => {
    expect(rocketSpanM(stage([{ type: 'bodytube', id: 't', length: 0.1, outerRadius: 0.005 }]))).toBeCloseTo(0.01, 9);
  });
});
