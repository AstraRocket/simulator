import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
// @ts-expect-error - a plain .mjs build script helper, no types
import { PRESET_CORRECTIONS, applyPresetCorrections } from '../../scripts/lib/presetCorrections.mjs';
import { RECOVERY_DENSITY_RANGE } from '../../src/services/design/recoveryDensity';

type Row = Record<string, unknown>;

const streamer = (partNo: string, materialDensity: number): Row => ({
  type: 'streamer',
  mfr: 'FlisKits',
  partNo,
  material: 'Paper',
  materialDensity,
});

const one = [{ type: 'streamer', mfr: 'FlisKits', partNo: 'STD-660', field: 'materialDensity', from: 90, to: 0.09 }];

describe('corrections to the source parts files', () => {
  it('replaces the value the source holds', () => {
    const rows = [streamer('STD-660', 90), streamer('STD-440', 90)];
    expect(applyPresetCorrections(rows, one)).toBe(1);
    expect(rows.map((r) => r.materialDensity)).toEqual([0.09, 90]);
  });

  it('leaves a row it already corrected, as on a rerun', () => {
    const rows = [streamer('STD-660', 0.09)];
    expect(applyPresetCorrections(rows, one)).toBe(0);
    expect(rows[0]!.materialDensity).toBe(0.09);
  });

  it('refuses when the source no longer holds the value it replaces', () => {
    expect(() => applyPresetCorrections([streamer('STD-660', 0.1)], one)).toThrow(/holds 0\.1, not 90/);
  });

  it('refuses when the part is gone', () => {
    expect(() => applyPresetCorrections([streamer('STD-440', 90)], one)).toThrow(/no such part/);
  });

  it('matches every shipped correction to a catalog row holding its corrected value', () => {
    const cat = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/components.generated.json'), 'utf8')) as {
      components: Row[];
    };
    expect(applyPresetCorrections(cat.components)).toBe(0);
    expect(PRESET_CORRECTIONS.length).toBe(9);
  });

  it('leaves no catalog recovery part outside the design check ranges', () => {
    const cat = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/components.generated.json'), 'utf8')) as {
      components: Row[];
    };
    const outside = (v: unknown, { min, max }: { min: number; max: number }) =>
      typeof v === 'number' && v !== 0 && (v < min || v > max);
    const bad = cat.components
      .filter(
        (r) =>
          ((r.type === 'parachute' || r.type === 'streamer') &&
            outside(r.materialDensity, RECOVERY_DENSITY_RANGE.surface)) ||
          outside(r.lineMaterialDensity, RECOVERY_DENSITY_RANGE.line),
      )
      .map((r) => `${r.mfr as string} ${r.partNo as string}`);
    expect(bad).toEqual([]);
  });
});
