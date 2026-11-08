import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  CLUSTER_POINTS,
  CLUSTER_OPTIONS,
  clusterCount,
  clusterOffsets,
  isClusterPattern,
} from '../../src/tree/cluster';

const JAVA = readFileSync(
  fileURLToPath(
    new URL(
      '../../../engine-java/src/java/info/openrocket/core/rocketcomponent/ClusterConfiguration.java',
      import.meta.url,
    ),
  ),
  'utf8',
).replace(/\s+/g, ' ');

function kernelPatterns(): [string, number[]][] {
  const R5 = 1.0 / (2 * Math.sin((2 * Math.PI) / 10));
  const SQRT2 = 1.4142135623730951;
  const SQRT3 = 1.7320508075688772;
  const out: [string, number[]][] = [];
  const marker = 'new ClusterConfiguration(';
  for (let at = JAVA.indexOf(marker); at >= 0; at = JAVA.indexOf(marker, at + 1)) {
    let depth = 1;
    let end = at + marker.length;
    for (; depth > 0; end++) depth += JAVA[end] === '(' ? 1 : JAVA[end] === ')' ? -1 : 0;
    const args = JAVA.slice(at + marker.length, end - 1).split(',');
    const name = /^\s*"([^"]+)"\s*$/.exec(args[0]!)?.[1];
    if (!name) continue;
    // Java arithmetic that is also valid JavaScript, so the table is the kernel's, not a retyped copy.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- source is the committed kernel file
    const evaluate = new Function('R5', 'SQRT2', 'SQRT3', `return [${args.slice(1).join(',')}];`) as (
      ...k: number[]
    ) => number[];
    out.push([name, evaluate(R5, SQRT2, SQRT3)]);
  }
  return out;
}

describe('CLUSTER_POINTS vs ClusterConfiguration.java', () => {
  it('is generated from the helper constants the table was written against', () => {
    expect(JAVA).toContain('private static final double R5 = 1.0 / (2 * Math.sin(2 * Math.PI / 10));');
    expect(JAVA).toContain('private static final double SQRT2 = 1.4142135623730951;');
    expect(JAVA).toContain('private static final double SQRT3 = 1.7320508075688772;');
  });

  it('holds every kernel pattern, its points and the kernel order', () => {
    const kernel = kernelPatterns();
    expect(kernel.length).toBeGreaterThan(10);
    // SINGLE is declared once on its own and once more in CONFIGURATIONS by reference.
    expect(kernel.map(([name]) => name)).toEqual(Object.keys(CLUSTER_POINTS));
    for (const [name, pts] of kernel) {
      const ours = CLUSTER_POINTS[name as keyof typeof CLUSTER_POINTS];
      expect(ours, name).toHaveLength(pts.length);
      pts.forEach((v, i) => expect(ours[i], `${name}[${i}]`).toBeCloseTo(v, 12));
    }
  });
});

describe('clusterCount', () => {
  it('defaults an absent cluster to a single motor', () => {
    expect(clusterCount(undefined)).toBe(1);
  });

  it('counts the point pairs of a known pattern', () => {
    expect(clusterCount('double')).toBe(2);
    expect(clusterCount('9-grid')).toBe(9);
  });

  it('treats an unknown pattern as single', () => {
    expect(clusterCount('nonsense')).toBe(1);
  });
});

describe('CLUSTER_POINTS / CLUSTER_OPTIONS', () => {
  it('every pattern is a flat list of [x, y] pairs', () => {
    for (const [name, pts] of Object.entries(CLUSTER_POINTS)) {
      expect(pts.length % 2, `${name} should have an even point count`).toBe(0);
    }
  });

  it('offers every pattern as a dropdown option, in kernel order', () => {
    expect(CLUSTER_OPTIONS).toEqual(Object.keys(CLUSTER_POINTS));
    expect(CLUSTER_OPTIONS[0]).toBe('single');
    expect(CLUSTER_OPTIONS.every((n) => clusterCount(n) >= 1)).toBe(true);
  });
});

describe('clusterOffsets', () => {
  it('single sits on the axis', () => {
    expect(clusterOffsets('single', 0.01)).toEqual([{ y: 0, z: 0 }]);
  });

  it('spaces tubes by 2·radius·scale in the cross-section plane', () => {
    const out = clusterOffsets('double', 0.01, 1, 0);
    expect(out).toHaveLength(2);
    expect(out[0]!.y).toBeCloseTo(-0.01);
    expect(out[0]!.z).toBeCloseTo(0);
    expect(out[1]!.y).toBeCloseTo(0.01);
    expect(out[1]!.z).toBeCloseTo(0);
  });

  it('applies clusterScale to the separation', () => {
    const out = clusterOffsets('double', 0.01, 2, 0);
    expect(out[1]!.y).toBeCloseTo(0.02);
  });

  it('rotates the layout the way the kernel rotates it', () => {
    // The kernel applies R(−θ), so (−0.5, 0) goes to +z, not −z.
    const out = clusterOffsets('double', 0.01, 1, Math.PI / 2);
    expect(out[0]!.y).toBeCloseTo(0);
    expect(out[0]!.z).toBeCloseTo(0.01);
    expect(out[1]!.y).toBeCloseTo(0);
    expect(out[1]!.z).toBeCloseTo(-0.01);
  });

  // Independent transcription of ClusterConfiguration.getPoints (ClusterConfiguration.java:108-119).
  it('matches ClusterConfiguration.getPoints for every pattern and rotation', () => {
    expect(JAVA).toContain('ret.add(x * cos + y * sin); ret.add(-x * sin + y * cos);');
    const kernelPoints = (pts: number[], rotation: number) => {
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const out: { y: number; z: number }[] = [];
      for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i]!;
        const y = pts[i + 1]!;
        out.push({ y: x * cos + y * sin, z: -x * sin + y * cos });
      }
      return out;
    };

    const r = 0.0095;
    const scale = 1.3;
    const separation = 2 * r * scale;
    for (const [name, pts] of Object.entries(CLUSTER_POINTS)) {
      for (const deg of [0, 30, 45, 90, 137, -60]) {
        const rot = (deg * Math.PI) / 180;
        const got = clusterOffsets(name, r, scale, rot);
        const want = kernelPoints(pts, rot);
        expect(got, `${name} @ ${deg}°`).toHaveLength(want.length);
        want.forEach((w, i) => {
          expect(got[i]!.y, `${name} @ ${deg}° [${i}].y`).toBeCloseTo(w.y * separation, 12);
          expect(got[i]!.z, `${name} @ ${deg}° [${i}].z`).toBeCloseTo(w.z * separation, 12);
        });
      }
    }
  });

  it('falls back to a single on-axis tube for an unknown pattern', () => {
    expect(clusterOffsets('nonsense', 0.01)).toEqual([{ y: 0, z: 0 }]);
  });
});

describe('isClusterPattern', () => {
  it('accepts every option and rejects anything else', () => {
    for (const o of CLUSTER_OPTIONS) expect(isClusterPattern(o), o).toBe(true);
    expect(isClusterPattern('7-ring')).toBe(false);
    expect(isClusterPattern('toString')).toBe(false); // not via the prototype chain
    expect(isClusterPattern(undefined)).toBe(false);
  });
  it('an unknown pattern lays out as a single tube everywhere it is read', () => {
    expect(clusterCount('7-ring')).toBe(1);
    expect(clusterOffsets('7-ring', 0.01)).toEqual([{ y: 0, z: 0 }]);
  });
});
