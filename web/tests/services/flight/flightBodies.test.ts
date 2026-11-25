import { describe, expect, it } from 'vitest';
import type { FlightResult, RocketTree } from '../../../src/engine/openRocketEngine';
import { carrierAt, flightBodies } from '../../../src/services/flight/flightBodies';

const branch = (name: string, events: object[] = []) => ({
  name,
  events,
  series: { time: [0, 1, 2], altitude: [0, 1, 2] },
});
const result = (...branches: object[]): FlightResult =>
  ({ summary: {}, events: [], series: { time: [], altitude: [] }, branches }) as unknown as FlightResult;
const left = (time: number, sourceId?: string, source?: string) => ({
  type: 'STAGE_SEPARATION',
  time,
  sourceId,
  source,
});

const tree = {
  name: 'T',
  components: [
    {
      type: 'stage',
      id: 's0',
      name: 'Top',
      children: [
        {
          type: 'bodytube',
          id: 'tube',
          children: [
            { type: 'parallelstage', id: 'side', name: 'Side', children: [{ type: 'nosecone', id: 'side-nose' }] },
            { type: 'podset', id: 'pod', children: [{ type: 'nosecone', id: 'pod-nose' }] },
          ],
        },
      ],
    },
    { type: 'stage', id: 's1', name: 'Middle', children: [{ type: 'bodytube', id: 'mid-tube' }] },
    { type: 'stage', id: 's2', name: 'Bottom', children: [{ type: 'bodytube', id: 'low-tube' }] },
  ],
} as unknown as RocketTree;

describe('which parts fly on which branch', () => {
  it('is everything on the first branch for a single-branch flight', () => {
    const [only, ...rest] = flightBodies(tree, result(branch('Top')));
    expect(rest).toEqual([]);
    expect([...only!.partIds]).toContain('low-tube');
    expect(carrierAt([only!], 0, 999)).toBe(0);
  });

  it('gives each separated stage its own parts, strap-ons included and pods left on', () => {
    const bodies = flightBodies(
      tree,
      result(branch('Top'), branch('Side', [left(1, 'side')]), branch('Bottom', [left(2, 's2')])),
    );
    expect([...bodies[1]!.partIds]).toEqual(['side', 'side-nose']);
    expect([...bodies[2]!.partIds]).toEqual(['s2', 'low-tube']);
    expect([...bodies[0]!.partIds]).toEqual(['s0', 'tube', 'pod', 'pod-nose', 's1', 'mid-tube']);
    expect(bodies.map((b) => b.separatedAt)).toEqual([Infinity, 1, 2]);
  });

  it('flies a stage that never separates with the one above it', () => {
    const bodies = flightBodies(tree, result(branch('Top'), branch('Middle', [left(2, 's1')])));
    expect([...bodies[1]!.partIds]).toEqual(['s1', 'mid-tube', 's2', 'low-tube']);
  });

  it('matches by name where the result carries no ids', () => {
    const bodies = flightBodies(tree, result(branch('Top'), branch('Bottom', [left(2, undefined, 'Bottom')])));
    expect([...bodies[1]!.partIds]).toEqual(['s2', 'low-tube']);
  });

  it('leaves every part on the first branch when a stage cannot be matched', () => {
    const bodies = flightBodies(tree, result(branch('Top'), branch('Gone', [left(2, 'no-such-id', 'Gone')])));
    expect(bodies[1]!.partIds.size).toBe(0);
    expect(bodies[0]!.partIds.has('low-tube')).toBe(true);
  });
});

describe('what carries a body', () => {
  it('is the stack until it separates, through a stage that left first', () => {
    const bodies = flightBodies(
      tree,
      result(branch('Top'), branch('Middle', [left(1, 's1')]), branch('Bottom', [left(2, 's2')])),
    );
    expect([0.5, 1, 1.5, 2].map((t) => carrierAt(bodies, 2, t))).toEqual([0, 1, 1, 2]);
    expect([0.5, 1].map((t) => carrierAt(bodies, 1, t))).toEqual([0, 1]);
  });
});
