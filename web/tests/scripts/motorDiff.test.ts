import { describe, it, expect } from 'vitest';
// @ts-expect-error - a plain .mjs build script helper, no types
import { diffMotors, motorDiffHeadline, motorDiffMarkdown, describeField } from '../../scripts/lib/motorDiff.mjs';

/**
 * The sync workflow's motor report (scripts/diff-motors.mjs). Motors match on
 * the row key, so a motor whose values moved is "changed", not one removed and
 * one added, and two motors that share a designation but not a diameter stay
 * two motors.
 */
const motor = (over: Record<string, unknown> = {}) => ({
  manufacturer: 'Estes',
  designation: 'C6',
  diameter: 18,
  class: 'C',
  impulse: 8.8,
  burn: 1.86,
  delays: '0,3,5,7',
  oop: false,
  curves: [
    {
      src: 'Certified · RASP',
      samples: [
        [0, 0],
        [1, 1],
      ],
    },
  ],
  ...over,
});

describe('diffMotors', () => {
  it('reports nothing for identical catalogs', () => {
    const d = diffMotors([motor()], [motor()]);
    expect(motorDiffHeadline(d)).toBe('no change');
    expect(motorDiffMarkdown(d)).toBe('### Motors: no change\n');
  });

  it('matches on the row key, so a new diameter is a new motor', () => {
    const d = diffMotors([motor()], [motor(), motor({ diameter: 24 })]);
    expect(d.added).toHaveLength(1);
    expect(d.added[0].diameter).toBe(24);
    expect(d.removed).toHaveLength(0);
    expect(d.changed).toHaveLength(0);
  });

  it('reports a dropped motor as removed', () => {
    const d = diffMotors([motor(), motor({ designation: 'D12' })], [motor()]);
    expect(d.removed.map((m: { designation: string }) => m.designation)).toEqual(['D12']);
  });

  it('lists the fields that changed, in reading order', () => {
    const d = diffMotors([motor()], [motor({ oop: true, impulse: 9.1 })]);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].fields.map(describeField)).toEqual(['impulse 8.8 → 9.1', 'oop no → yes']);
    expect(motorDiffHeadline(d)).toBe('0 added, 0 removed, 1 changed');
  });

  it('reads a missing flag as false, the way the catalog writes it', () => {
    const { oop: _, ...inProduction } = motor();
    expect(diffMotors([inProduction], [motor({ oop: false })]).changed).toHaveLength(0);
    const d = diffMotors([inProduction], [motor({ oop: true })]);
    expect(d.changed[0].fields.map(describeField)).toEqual(['oop no → yes']);
  });

  it('summarizes a curve change instead of printing the samples', () => {
    const extra = { src: 'User · RockSim', samples: [[0, 0]] };
    const d = diffMotors([motor()], [motor({ curves: [...motor().curves, extra] })]);
    expect(d.changed[0].fields.map(describeField)).toEqual(['thrust curves 1 → 2']);
  });

  it('reports a field that appears or disappears', () => {
    const { digests: _, ...noDigests } = { ...motor(), digests: ['abc'] };
    const d = diffMotors([noDigests], [motor({ digests: ['abc'] })]);
    expect(d.changed[0].fields.map(describeField)).toEqual(['OpenRocket digests added']);
  });

  it('caps each list so a summary stays small', () => {
    const before = Array.from({ length: 5 }, (_, i) => motor({ designation: `C${i}` }));
    const after = before.map((m) => ({ ...m, burn: 2 }));
    const md = motorDiffMarkdown(diffMotors(before, after), { limit: 2 });
    expect(md).toContain('Changed (5)');
    expect(md).toContain('3 more not shown.');
  });
});
