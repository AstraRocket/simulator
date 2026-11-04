import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { KERNEL_DEFAULTS } from '../../src/tree/kernelDefaults';
import { COMPONENT_DEFAULTS } from '../../src/services/design/componentDefaults';
import { discSolidForNode, solidForNode } from '../../src/services/exports/solidMesh';
import { discDims } from '../../src/services/design/discGeometry';
import type { ComponentNode } from '../../src/engine/openRocketEngine';

const outerRadiusOf = (geo: THREE.BufferGeometry): number => {
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  return Math.max(Math.abs(b.max.y), Math.abs(b.min.y), Math.abs(b.max.z), Math.abs(b.min.z));
};

const lengthOf = (geo: THREE.BufferGeometry): number => {
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  return b.max.x - b.min.x;
};

const innerRadiusOf = (geo: THREE.BufferGeometry): number => {
  const pos = geo.getAttribute('position');
  let min = Infinity;
  for (let i = 0; i < pos.count; i++) {
    min = Math.min(min, Math.hypot(pos.getY(i), pos.getZ(i)));
  }
  return min;
};

describe('the printable solid uses the kernel default for an absent radius', () => {
  const tube = (type: string): ComponentNode => ({ type, id: type, length: 0.05 }) as unknown as ComponentNode;

  it.each([
    ['bodytube', KERNEL_DEFAULTS.bodytube.outerRadius],
    ['innertube', KERNEL_DEFAULTS.innertube.outerRadius],
    ['launchlug', KERNEL_DEFAULTS.launchlug.outerRadius],
  ] as const)('%s lathes at the radius the kernel builds', (type, expected) => {
    const geo = solidForNode(tube(type));
    expect(geo).not.toBeNull();
    // Lathed in SEGMENTS facets, so the measured radius is the inscribed one.
    expect(outerRadiusOf(geo!)).toBeGreaterThan(expected * 0.99);
    expect(outerRadiusOf(geo!)).toBeLessThanOrEqual(expected * 1.0001);
  });

  it('separates the three, which one flat literal could not', () => {
    const r = (t: string) => outerRadiusOf(solidForNode(tube(t))!);
    expect(r('innertube')).toBeLessThan(r('bodytube'));
    expect(r('launchlug')).toBeLessThan(r('innertube'));
  });

  it('uses the kernel wall for a body tube, not the inner tube one', () => {
    const geo = solidForNode(tube('bodytube'))!;
    const wall = outerRadiusOf(geo) - innerRadiusOf(geo);
    expect(wall).toBeCloseTo(KERNEL_DEFAULTS.bodytube.thickness, 5);
    expect(wall).not.toBeCloseTo(KERNEL_DEFAULTS.innertube.thickness, 5);
  });

  it('uses the kernel wall for an inner tube', () => {
    const geo = solidForNode(tube('innertube'))!;
    expect(outerRadiusOf(geo) - innerRadiusOf(geo)).toBeCloseTo(KERNEL_DEFAULTS.innertube.thickness, 5);
  });

  it('skips a type the kernel states no radius for rather than inventing one', () => {
    expect(solidForNode(tube('tubefinset'), null)).toBeNull();
  });
});

describe('the disc sketch uses the kernel length for an absent coupler length', () => {
  const coupler = (type: string): ComponentNode =>
    ({ type, id: type, outerRadius: 0.012, thickness: 0.0005 }) as unknown as ComponentNode;

  it('sizes a tube coupler at the length the kernel builds', () => {
    const d = discDims(coupler('tubecoupler'), null, []);
    expect(d!.length).toBe(KERNEL_DEFAULTS.tubecoupler.length);
    expect(d!.length).not.toBe(0.003);
  });

  it('sizes an engine block at its own kernel length, which is different', () => {
    const d = discDims(coupler('engineblock'), null, []);
    expect(d!.length).toBe(KERNEL_DEFAULTS.engineblock.length);
    expect(d!.length).not.toBe(KERNEL_DEFAULTS.tubecoupler.length);
  });

  it('exports that coupler as a solid of the same length', () => {
    const d = discDims(coupler('tubecoupler'), null, [])!;
    const geo = discSolidForNode(d.outerR, d.innerR, d.length);
    expect(lengthOf(geo!)).toBeCloseTo(KERNEL_DEFAULTS.tubecoupler.length, 6);
  });
});

describe('the table is the one home, so the app-side table defers to it', () => {
  it('carries the coupler length the kernel builds', () => {
    expect(COMPONENT_DEFAULTS.tubecoupler.length).toBe(KERNEL_DEFAULTS.tubecoupler.length);
  });
});
