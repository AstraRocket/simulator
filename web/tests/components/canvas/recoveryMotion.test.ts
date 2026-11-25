import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';
import {
  canopyGeometry,
  collapse,
  deviceTurn,
  inflation,
  reachAbove,
  recoveryShape,
  stripGeometry,
  waveStrip,
  type RecoveryShape,
} from '../../../src/components/canvas/recoveryMotion';
import { mergePalette } from '../../../src/services/design/partColors';
import type { Deployment } from '../../../src/services/flight/flightSources';
import { KERNEL_DEFAULTS } from '../../../src/tree/kernelDefaults';

const shape = (n: object) => recoveryShape({ id: 'd', ...n } as ComponentNode, mergePalette({}));
const UP = new THREE.Vector3(0, 1, 0);

describe('the shape of a recovery device', () => {
  it('sizes a keyless streamer at the kernel default', () => {
    expect(shape({ type: 'streamer' })).toMatchObject({
      kind: 'streamer',
      length: KERNEL_DEFAULTS.streamer.stripLength,
      width: KERNEL_DEFAULTS.streamer.stripWidth,
    });
  });

  it('takes a canopy and its lines from the part', () => {
    expect(shape({ type: 'parachute', diameter: 1, lineCount: 8, lineLength: 0.9 })).toMatchObject({
      mouth: expect.closeTo(0.33, 6),
      lines: 8,
      lineLength: 0.9,
    });
  });

  it('follows the kernel for automatic lines, and keeps lines too short for their canopy drawable', () => {
    expect(shape({ type: 'parachute', diameter: 2, lineLengthAuto: true, lineLength: 0.1 })).toMatchObject({
      lineLength: 3,
    });
    expect(shape({ type: 'parachute', diameter: 2, lineLength: 0.1 })).toMatchObject({
      lineLength: expect.closeTo(0.792, 6),
    });
  });
});

describe('inflation', () => {
  it('opens from packed, past full, and settles', () => {
    expect(inflation(-1)).toBeLessThan(0.2);
    expect(inflation(0.1)).toBeLessThan(0.7);
    expect(inflation(0.45)).toBeGreaterThan(1.02);
    expect(inflation(0.45)).toBeLessThan(1.15);
    expect(inflation(2)).toBeCloseTo(1, 2);
  });
});

describe('a canopy on the ground', () => {
  it('spills its air once down, and not before', () => {
    expect(collapse(-5)).toBe(0);
    expect(collapse(0.6)).toBeGreaterThan(0.2);
    expect(collapse(3)).toBe(1);
  });
});

describe('how a device lies', () => {
  const chute = shape({ type: 'parachute', diameter: 0.6, lineLength: 0.6 });
  const drogue = shape({ type: 'parachute', diameter: 0.3, lineLength: 0.4 });
  const deployment = (from: number, body = 0): Deployment => ({
    device: { id: 'd', type: 'parachute' } as ComponentNode,
    body,
    from,
    to: 100,
  });
  const hung = (out: Deployment[], shapes: RecoveryShape[]) =>
    out.map((d, i) => ({ ...d, shape: shapes[i]!, group: String(d.body) }));
  const along = (out: Deployment[], shapes: RecoveryShape[], i: number, t: number, dir = UP) =>
    UP.clone().applyQuaternion(deviceTurn(hung(out, shapes), i, t, dir, new THREE.Quaternion()));

  it('leaves along the nose, then sways only a little', () => {
    const side = new THREE.Vector3(1, 0, 0);
    expect(along([deployment(5)], [chute], 0, 5, side).angleTo(side)).toBeCloseTo(0, 5);
    for (const t of [8, 9, 10, 20]) expect(along([deployment(5)], [chute], 0, t).angleTo(UP)).toBeLessThan(0.12);
  });

  it('leans two on one body apart once both are out, and leaves another body be', () => {
    const out = [deployment(5), deployment(20)];
    const shapes = [drogue, chute];
    const apart = along(out, shapes, 0, 30).angleTo(along(out, shapes, 1, 30));
    expect(apart).toBeGreaterThan(0.5);
    expect(along(out, shapes, 0, 19).angleTo(UP)).toBeLessThan(0.12);
    expect(along([deployment(5), deployment(20, 1)], shapes, 0, 30).angleTo(UP)).toBeLessThan(0.12);
  });

  it('asks the camera for room as it opens', () => {
    const out = [deployment(5), deployment(20)];
    const shapes = [drogue, chute];
    expect(reachAbove(hung(out, shapes), 0, 5)).toBe(0);
    expect(reachAbove(hung(out, shapes), 0, 10)).toBeCloseTo(0.4 + 0.099, 6);
    expect(reachAbove(hung(out, shapes), 0, 200)).toBeCloseTo(0.6 + 0.198, 6);
    expect(reachAbove(hung(out, shapes), 1, 200)).toBe(0);
  });
});

describe('the drawn cloth', () => {
  it('closes a canopy over a mouth of radius 1', () => {
    const g = canopyGeometry(6);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(0, 6);
    expect(g.boundingBox!.max.y).toBeCloseTo(0.75, 6);
    g.computeBoundingSphere();
    const pos = g.getAttribute('position');
    const radii = Array.from({ length: pos.count }, (_, i) => Math.hypot(pos.getX(i), pos.getZ(i)));
    expect(Math.max(...radii)).toBeCloseTo(1, 6);
  });

  it('unrolls a streamer to its full length, tied at its origin', () => {
    const pos = stripGeometry().getAttribute('position') as THREE.BufferAttribute;
    waveStrip(pos, 0.5, 0.05, 3);
    expect(pos.getY(0)).toBe(0);
    expect(pos.getY(pos.count - 1)).toBeCloseTo(0.5, 6);
    waveStrip(pos, 0.5, 0.05, 0);
    expect(pos.getY(pos.count - 1)).toBeLessThan(0.1);
  });
});
