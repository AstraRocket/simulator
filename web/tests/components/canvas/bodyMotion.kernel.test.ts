import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { FlightResult, RocketTree } from '../../../src/engine/openRocketEngine';
import {
  bodyPieces,
  bodySpans,
  extentCenter,
  newPlacement,
  pieceExtent,
  placeCarrier,
} from '../../../src/components/canvas/bodyMotion';
import { buildFlightScene, SETTLE_SECONDS } from '../../../src/components/canvas/flightScene';
import { trackPositionAt } from '../../../src/components/canvas/flightTrack';
import { buildPieces } from '../../../src/components/canvas/rocketPieces';
import { carrierAt, flightBodies } from '../../../src/services/flight/flightBodies';
import { flyTwoStage, TWO_STAGE } from '../../testing/twoStageFlight';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

const tree = TWO_STAGE as unknown as RocketTree;
const phase = { boost: '#ff0000', coast: '#00ff00', descent: '#0000ff' };
const SCALE = 2;

let result: FlightResult;
beforeAll(async () => {
  result = await flyTwoStage();
});

const flight = () => {
  const bodies = flightBodies(tree, result);
  const scene = buildFlightScene(result, phase);
  const owned = bodyPieces(bodies, buildPieces(tree).pieces);
  const spans = bodySpans(bodies, scene.tracks, owned.map(pieceExtent));
  /** Where the rocket-axis station `x` of a body's parts is drawn. */
  const station = (body: number, x: number, t: number) => {
    const carrier = carrierAt(bodies, body, t);
    const p = placeCarrier(scene.tracks[carrier]!, spans[carrier]!, t, SCALE, newPlacement());
    return new THREE.Vector3((x - extentCenter(p.span)) * SCALE, 0, 0).applyQuaternion(p.quaternion).add(p.position);
  };
  return { bodies, scene, owned, spans, station };
};

describe('a two-stage flight', () => {
  it('splits the drawn parts between the sustainer and the booster', () => {
    const { owned } = flight();
    expect(pieceExtent(owned[0]!)).toMatchObject({ fore: expect.closeTo(0, 2), aft: expect.closeTo(0.37, 2) });
    expect(pieceExtent(owned[1]!).fore).toBeCloseTo(0.37, 2);
  });

  it('moves neither body at the instant they separate', () => {
    const { bodies, station } = flight();
    const t = bodies[1]!.separatedAt;
    expect(t).toBeGreaterThan(1);
    for (const [body, x] of [
      [0, 0.1],
      [1, 0.45],
    ] as const) {
      const step = station(body, x, t).distanceTo(station(body, x, t - 1e-6));
      expect(step).toBeLessThan(1e-3);
    }
  });

  it('draws the stack as one until then, and the booster on its own path after', () => {
    const { bodies, scene, station } = flight();
    const t = bodies[1]!.separatedAt;
    const gap = (at: number) => station(0, 0.1, at).distanceTo(station(1, 0.45, at));
    expect(gap(t - 0.5)).toBeCloseTo(0.35 * SCALE, 6);
    expect(gap(t + 2)).toBeGreaterThan(0.35 * SCALE + 0.5);
    const far = trackPositionAt(scene.tracks[1]!, t + 4, new THREE.Vector3());
    expect(station(1, 0.45, t + 4).distanceTo(far)).toBeLessThan(0.5 * SCALE);
  });

  it('plays until the last branch is down, and a moment to settle', () => {
    const { scene } = flight();
    const ends = result.branches!.map((b) => b.series.time.at(-1)!);
    expect(scene.duration).toBeCloseTo(Math.max(...ends) + SETTLE_SECONDS, 6);
    expect(scene.tracks).toHaveLength(2);
  });
});
