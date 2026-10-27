import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UNITS } from '../../src/prefs/units';

/**
 * Pound-force, as desktop's UnitGroup defines it for force and impulse
 * (UNITS_FORCE, UNITS_IMPULSE). Read from the Java, so a thrust or impulse
 * shown in lbf is the figure desktop shows.
 */
describe('pound-force', () => {
  const java = readFileSync(
    join(process.cwd(), '../engine-java/src/java/info/openrocket/core/unit/UnitGroup.java'),
    'utf8',
  );
  const factor = (symbol: RegExp) => {
    const m = java.match(symbol);
    expect(m, String(symbol)).not.toBeNull();
    return Number(m![1]);
  };

  it('is the factor UnitGroup gives force', () => {
    const want = factor(/UNITS_FORCE\.addUnit\(new GeneralUnit\(([\d.]+), "lbf"\)\)/);
    expect(UNITS.force.find((u) => u.symbol === 'lbf')!.toSI).toBe(want);
  });

  it('is the factor UnitGroup gives impulse', () => {
    const want = factor(/UNITS_IMPULSE\.addUnit\(new GeneralUnit\(([\d.]+), "lbf" \+ DOT \+ "s"\)\)/);
    expect(UNITS.impulse.find((u) => u.symbol === 'lbf·s')!.toSI).toBe(want);
  });
});
