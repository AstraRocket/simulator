import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';
import { DERIVED, MAX_SWEEP_ANGLE } from '../../../src/services/design/derivedFields';
import { MAX_ANGLE_STEP_RANGE } from '../../../src/services/flight/simulations';

/**
 * Limits the app applies for itself, because the bridge never calls the setter
 * that holds them: the derived rows of the property panel (a fin's sweep
 * angle, a streamer's area and aspect ratio, a mass component's density) and
 * the simulation's maximum angle step. Each is read out of the kernel's Java
 * here, so a change upstream fails this test rather than drifting silently.
 */

const JAVA = join(process.cwd(), '../engine-java/src/java/info/openrocket/core');
const java = (file: string) => readFileSync(join(JAVA, file), 'utf8');

/**
 * A Java constant expression of the kind these limits are written in: numbers
 * and `Math.PI` joined by `*` and `/`, in parentheses or not.
 */
function evalJava(expr: string): number {
  const tokens = expr
    .replace(/[()]/g, ' ')
    .trim()
    .split(/\s*([*/])\s*/);
  const value = (t: string) => (t === 'Math.PI' ? Math.PI : Number(t));
  let out = value(tokens[0]!);
  for (let i = 1; i < tokens.length; i += 2) {
    const v = value(tokens[i + 1]!);
    out = tokens[i] === '*' ? out * v : out / v;
  }
  if (!Number.isFinite(out)) throw new Error(`unexpected Java constant: ${expr}`);
  return out;
}

/** The first capture of `re` in `source`, evaluated as the Java writes it. */
function javaNumber(source: string, re: RegExp, what: string): number {
  const m = source.match(re);
  if (!m?.[1]) throw new Error(`${what} not found in the Java`);
  return evalJava(m[1]);
}

describe('limits held to the kernel Java', () => {
  it("is a trapezoid fin's steepest sweep, TrapezoidFinSet.MAX_SWEEP_ANGLE", () => {
    const want = javaNumber(
      java('rocketcomponent/TrapezoidFinSet.java'),
      /MAX_SWEEP_ANGLE\s*=\s*([^;]+);/,
      'MAX_SWEEP_ANGLE',
    );
    expect(MAX_SWEEP_ANGLE).toBeCloseTo(want, 12);
  });

  it("is a streamer's aspect ratio for a strip with no width, Streamer.getAspectRatio", () => {
    const src = java('rocketcomponent/Streamer.java');
    const fallback = javaNumber(src, /stripWidth > 0\.0001\)[\s\S]*?return\s+([\d.]+);/, 'getAspectRatio fallback');
    const node = { type: 'streamer', stripWidth: 0, stripLength: 1 } as unknown as ComponentNode;
    expect(DERIVED.stripAspect.read(node)).toBe(fallback);
  });

  it("is a streamer's narrowest aspect ratio, Streamer.setAspectRatio", () => {
    const src = java('rocketcomponent/Streamer.java');
    const floor = javaNumber(src, /ratio\s*=\s*Math\.max\(ratio,\s*([\d.]+)\)/, 'setAspectRatio floor');
    const node = { type: 'streamer', stripWidth: 0.05, stripLength: 1 } as unknown as ComponentNode;
    const area = DERIVED.stripArea.read(node);
    const written = DERIVED.stripAspect.write(node, 0) as { stripWidth: number; stripLength: number };
    // Kept at the area it had, at the floor's ratio: width = sqrt(area / ratio).
    expect(written.stripWidth).toBeCloseTo(Math.sqrt(area / floor), 12);
  });

  it("is a mass component's heaviest mass, MassComponent.setComponentMass", () => {
    const src = java('rocketcomponent/MassComponent.java');
    const ceiling = javaNumber(src, /MathUtil\.clamp\(m,\s*0,\s*([\d.]+)\)/, 'setComponentMass ceiling');
    const node = { type: 'masscomponent', length: 0.1, radius: 0.05, mass: 0.1 } as unknown as ComponentNode;
    const written = DERIVED.massDensity.write(node, 1e15) as { mass: number };
    expect(written.mass).toBe(ceiling);
  });

  it('is the range of the maximum angle step, SimulationOptions.setMaximumStepAngle', () => {
    const src = java('simulation/SimulationOptions.java');
    const m = src.match(/maximumAngle\s*=\s*MathUtil\.clamp\(maximumAngle,\s*([^,]+),\s*([^)]+)\)/);
    expect(m).not.toBeNull();
    expect(MAX_ANGLE_STEP_RANGE.min).toBeCloseTo(evalJava(m![1]!), 12);
    expect(MAX_ANGLE_STEP_RANGE.max).toBeCloseTo(evalJava(m![2]!), 12);
  });
});
