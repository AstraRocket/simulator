import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { FlightResult, RocketTree } from '../../../src/engine/openRocketEngine';
import { bodyPieces, bodySpans, pieceExtent } from '../../../src/components/canvas/bodyMotion';
import { buildFlightScene } from '../../../src/components/canvas/flightScene';
import { airframeRadius, launchRod } from '../../../src/components/canvas/launchPad';
import { buildPieces } from '../../../src/components/canvas/rocketPieces';
import {
  blastPuffs,
  dustPuffs,
  popPuffs,
  smokeSources,
  trailPuffs,
  type Puff,
} from '../../../src/components/canvas/smokeTrail';
import { flightBodies } from '../../../src/services/flight/flightBodies';
import { flightPops, mountBurns } from '../../../src/services/flight/flightSources';
import { flyTwoStage, TWO_STAGE } from '../../testing/twoStageFlight';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

const tree = TWO_STAGE as unknown as RocketTree;
const phase = { boost: '#ff0000', coast: '#00ff00', descent: '#0000ff' };

let result: FlightResult;
beforeAll(async () => {
  result = await flyTwoStage({ series: 'full', windAverage: 4, windStdDeviation: 0, windDirection: Math.PI / 2 });
});

const setup = () => {
  const bodies = flightBodies(tree, result);
  const scene = buildFlightScene(result, phase);
  const { pieces, nozzles } = buildPieces(tree);
  const extents = bodyPieces(bodies, pieces).map(pieceExtent);
  const spans = bodySpans(bodies, scene.tracks, extents);
  const { tracks, unitsPerMeter } = scene;
  const flight = { bodies, tracks, spans, unitsPerMeter };
  const burns = mountBurns(tree, bodies);
  const where = (p: Puff) => p.at.clone().divideScalar(unitsPerMeter).add(p.arm);
  return { bodies, scene, pieces, nozzles, extents, spans, flight, burns, where };
};

describe('the smoke trail', () => {
  it('runs through each burn, then its delay, and never between them', () => {
    const { flight, burns, nozzles } = setup();
    const times = trailPuffs(flight, burns, nozzles, undefined).map((p) => p.time);
    expect(times.some((t) => t < 2)).toBe(true);
    expect(times.filter((t) => t > 2.001 && t < 2.999)).toEqual([]);
    expect(times.some((t) => t > 3 && t < 5)).toBe(true);
    expect(times.some((t) => t > 5 && t < 10)).toBe(true);
    expect(Math.max(...times)).toBeLessThanOrEqual(10);
  });

  it('is spaced evenly along the nozzle’s way, not by the recorded samples', () => {
    const { flight, burns, nozzles, where } = setup();
    const boost = trailPuffs(flight, burns, nozzles, undefined).filter((p) => p.time < 2);
    const gaps = boost.slice(1).map((p, i) => where(p).distanceTo(where(boost[i]!)));
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    for (const g of gaps) expect(g).toBeGreaterThan(mean * 0.5);
    for (const g of gaps) expect(g).toBeLessThan(mean * 1.5);
    expect(boost[0]!.size).toBeGreaterThan(mean);
  });

  it('leaves the rocket’s tail, not its middle', () => {
    const { flight, burns, nozzles, scene } = setup();
    const late = trailPuffs(flight, burns, nozzles, undefined).filter((p) => p.time > 1 && p.time < 1.9);
    // Half of a 0.49 m stack, below its middle.
    for (const p of late) expect(p.arm.length()).toBeCloseTo(0.245, 2);
    for (const p of late) expect(p.arm.y).toBeLessThan(0);
    expect(scene.tracks).toHaveLength(2);
  });

  it('drifts with the wind the flight met', () => {
    const { flight, burns, nozzles, scene } = setup();
    const p = trailPuffs(flight, burns, nozzles, undefined).find((q) => q.time > 1)!;
    expect(p.drift.x / scene.unitsPerMeter).toBeCloseTo(-4, 1);
    expect(Math.abs(p.drift.z)).toBeLessThan(1e-3);
  });

  it('takes each motor’s own color, and the delay grain’s pale one', () => {
    const { flight, burns, nozzles } = setup();
    const look = { flame: ['#fff', '#fff', '#fff'] as const, smoke: 0.8, smokeColor: '#123456', sparks: false };
    const puffs = trailPuffs(flight, burns, nozzles, { 'booster-mount': look });
    expect(new Set(puffs.filter((p) => p.time < 2).map((p) => p.color))).toEqual(new Set(['#123456']));
    const delay = puffs.find((p) => p.time > 6)!;
    expect(delay.color).not.toBe('#123456');
    expect(delay.alpha).toBeLessThan(0.3);
  });

  it('draws a bounded number of puffs, larger where that spreads them', () => {
    const { flight, burns, nozzles } = setup();
    const thin = nozzles.map((n) => ({ ...n, radius: n.radius / 200 }));
    const puffs = trailPuffs(flight, burns, thin, undefined);
    expect(puffs.length).toBeLessThan(8200);
    expect(puffs[0]!.size).toBeGreaterThan(thin[0]!.radius * 2 * 2.6 * 2);
  });
});

describe('where smoke comes from', () => {
  const nozzle = (y: number, z: number) => ({ mountId: 'm', at: [1, y, z] as [number, number, number], radius: 0.01 });

  it('is the middle of a cluster, and each of two far apart', () => {
    const cluster = smokeSources([nozzle(0.02, 0), nozzle(-0.02, 0)]);
    expect(cluster).toHaveLength(1);
    expect(cluster[0]!.at).toEqual([1, 0, 0]);
    expect(smokeSources([nozzle(0.2, 0), nozzle(-0.2, 0)])).toHaveLength(2);
  });
});

describe('the puffs at a charge', () => {
  it('are thrown forward by an ejection and around by a separation', () => {
    const { flight, bodies, extents, pieces } = setup();
    const pops = flightPops(tree, bodies);
    const radius = airframeRadius(pieces);
    expect(radius).toBeCloseTo(0.012, 4);
    const puffs = popPuffs(flight, pops, (b) => extents[b]!.fore, radius);
    const thrown = (time: number) =>
      puffs
        .filter((p) => Math.abs(p.time - time) < 0.01)
        .reduce((sum, p) => sum.add(p.burst), new THREE.Vector3())
        .length();
    expect(thrown(10)).toBeGreaterThan(3 * thrown(2));
  });
});

describe('puffs along the ground', () => {
  it('spread from the pad for the motors lit on it, and not for an upper stage', () => {
    const { flight, burns, nozzles } = setup();
    const puffs = blastPuffs(flight, burns, nozzles, undefined);
    expect(puffs.length).toBeGreaterThan(20);
    for (const p of puffs) expect(p.time).toBeLessThan(0.5);
    const sum = puffs.reduce((s, p) => s.add(p.burst), new THREE.Vector3());
    expect(Math.hypot(sum.x, sum.z)).toBeLessThan(puffs.length * 0.1);
  });

  it('rise at each landing, more for a harder one', () => {
    const { flight } = setup();
    const at = (speed: number) => dustPuffs(flight, [{ body: 1, speed }], 0.012);
    const end = flight.tracks[1]!.times.at(-1)!;
    expect(at(4).every((p) => p.time === end)).toBe(true);
    expect(at(30)[3]!.burst.length()).toBeGreaterThan(at(4)[3]!.burst.length() * 2);
  });
});

describe('the launch rod', () => {
  it('stands beside the rocket on the ground, along the recorded launch attitude', () => {
    const { scene, spans, pieces } = setup();
    const rod = launchRod(scene, spans[0]![0]!, pieces, 1.2);
    expect(rod.length).toBe(1.2);
    expect(rod.dir.y).toBeCloseTo(1, 3);
    expect(rod.foot.y).toBe(0);
    expect(Math.hypot(rod.foot.x, rod.foot.z)).toBeGreaterThan(0.012);
    expect(Math.hypot(rod.foot.x, rod.foot.z)).toBeLessThan(0.02);
  });

  it('leans with a tilted launch', async () => {
    const { pieces, spans } = setup();
    const tilted = await flyTwoStage({ series: 'full', rodAngle: Math.PI / 18, rodDirection: Math.PI / 2 });
    const rod = launchRod(buildFlightScene(tilted, phase), spans[0]![0]!, pieces, 1);
    expect(rod.dir.x).toBeCloseTo(Math.sin(Math.PI / 18), 2);
    expect(rod.foot.y).toBe(0);
  });

  it('goes through the launch lug where there is one', () => {
    const { scene, spans, pieces } = setup();
    const lug = { ...pieces[0]!, key: 'lug9', geometry: new THREE.BoxGeometry(0.05, 0.002, 0.002) };
    const rod = launchRod(
      scene,
      spans[0]![0]!,
      [...pieces, { ...lug, position: [0.2, 0, 0.03], rotation: undefined }],
      1,
    );
    expect(Math.hypot(rod.foot.x, rod.foot.z)).toBeCloseTo(0.03, 3);
  });
});
