import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { FlightBody } from '../../../src/services/flight/flightBodies';
import { newPlacement, type BodySpan } from '../../../src/components/canvas/bodyMotion';
import { applyDrawn, drawnMotion, worldOf } from '../../../src/components/canvas/drawnMotion';
import { buildTrack, type FlightTrack } from '../../../src/components/canvas/flightTrack';

const span: BodySpan = { from: 0, fore: 0, aft: 0.4, offset: new THREE.Vector3() };
const track: FlightTrack = {
  ...buildTrack([], 1, Infinity),
  times: [0, 5, 10],
  vels: [0, 12, 9],
};
const body = (events: object[], wind = true) =>
  ({
    branch: {
      events,
      series: { time: [0, 10], altitude: [0, 0], ...(wind ? { Vw: [4, 4], θw: [Math.PI / 2, Math.PI / 2] } : {}) },
    },
  }) as unknown as FlightBody;
const place = (y = 5) => {
  const p = newPlacement();
  p.span = span;
  p.position.set(0, y, 0);
  return p;
};

describe('drawn tumbling', () => {
  const motion = drawnMotion(body([{ type: 'TUMBLE', time: 2 }]), track, span);

  it('starts at the recorded tumble and turns end over end', () => {
    const before = place();
    applyDrawn(before, motion, track, 1.9, 1, 0.02);
    expect(before.dir.y).toBe(1);
    const ys = [3, 3.4, 3.8, 4.2, 4.6, 5].map((t) => {
      const p = place();
      applyDrawn(p, motion, track, t, 1, 0.02);
      return p.dir.y;
    });
    expect(Math.min(...ys)).toBeLessThan(-0.3);
    expect(Math.max(...ys)).toBeGreaterThan(0.3);
  });

  it('is the same however the time is reached, and bounded in rate', () => {
    expect(motion.tumbleRate).toBeLessThanOrEqual(7);
    const a = place();
    const b = place();
    applyDrawn(a, motion, track, 4, 1, 0.02);
    applyDrawn(b, motion, track, 4, 1, 0.02);
    expect(a.quaternion.angleTo(b.quaternion)).toBeCloseTo(0, 6);
  });

  it('gives way to the hang once a device opens', () => {
    const opened = { ...track, deployT: 5 };
    const p = place();
    applyDrawn(p, motion, opened, 7, 1, 0.02);
    expect(p.dir.y).toBeCloseTo(1, 6);
  });

  it('is nothing on a body that never tumbled', () => {
    const p = place();
    applyDrawn(p, drawnMotion(body([]), track, span), track, 6, 1, 0.02);
    expect(p.dir.y).toBe(1);
    expect(p.position.y).toBe(5);
  });
});

describe('a landed body', () => {
  it('lies down along the wind, on the ground at its own radius', () => {
    const motion = drawnMotion(body([]), track, span);
    const p = place(0.2);
    applyDrawn(p, motion, track, 12, 1, 0.02);
    // Wind from the east blows west.
    expect(p.dir.x).toBeCloseTo(-1, 6);
    expect(p.position.y).toBeCloseTo(0.02, 6);
    const midway = place(0.2);
    applyDrawn(midway, motion, track, 10.4, 1, 0.02);
    expect(midway.position.y).toBeGreaterThan(0.02);
  });

  it('lies some way where no wind was recorded', () => {
    const p = place(0.2);
    applyDrawn(p, drawnMotion(body([], false), track, span), track, 12, 1, 0.02);
    expect(Math.abs(p.dir.y)).toBeLessThan(1e-6);
  });
});

describe('a point of a placed body', () => {
  it('is along its axis, scaled', () => {
    expect(worldOf(place(5), new THREE.Vector3(0, 0, 0), 2).y).toBeCloseTo(5.4, 9);
    expect(worldOf(place(5), new THREE.Vector3(-0.5, 0, 0), 2).y).toBeCloseTo(6.4, 9);
  });
});

describe('what hangs past the back of a body', () => {
  it('holds it off the ground', () => {
    const p = place(0.3);
    applyDrawn(p, drawnMotion(body([]), track, span), track, 6, 1, 0.02, 0.5);
    expect(p.position.y).toBeCloseTo(0.7, 9);
  });

  it('takes a long fall of cord longer to come down, and a short one no longer', () => {
    const halfway = (above: number) => drawnMotion(body([]), track, span, above).lie(10.5);
    expect(halfway(12)).toBeLessThan(halfway(0));
    expect(halfway(1)).toBe(halfway(0));
  });
});
