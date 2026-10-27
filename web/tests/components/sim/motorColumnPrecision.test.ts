import { describe, expect, it } from 'vitest';
import { COLUMNS } from '../../../src/components/sim/motorColumns';
import { inUserUnit } from '../../../src/components/sim/motorFormat';
import type { Units } from '../../../src/prefs/useUnits';
import { siToUi, type Quantity } from '../../../src/prefs/units';
import { fmtNum, ladderDigits } from '../../../src/i18n/format';
import type { CatalogMotor } from '../../../src/services/motors/motorDb';
import i18n from '../../../src/i18n';

/**
 * The motor grid reads a catalog motor to the precision the detail pane does:
 * the magnitude ladder of the value as shown. A fixed 0 decimals read every
 * 13 to 38 mm motor as "1 in", and picked the impulse's decimals from the SI
 * figure while showing it in the user's unit.
 */

/** Just enough of `Units` for the column cells: imperial lengths and impulse. */
const symbols: Partial<Record<Quantity, string>> = { motorDimensions: 'in', impulse: 'lbf·s', mass: 'oz', force: 'N' };
const u = {
  sym: (q: Quantity) => symbols[q]!,
  fmt: (q: Quantity, si: number, digits?: number) => {
    const ui = siToUi(q, symbols[q]!, si);
    return fmtNum(ui, digits ?? ladderDigits(ui));
  },
} as unknown as Units;

const motor = { designation: 'F40', diameter: 29, length: 124, impulse: 40, mass: 90, propWeightG: 3 } as CatalogMotor;
const col = (id: string) => COLUMNS.find((c) => c.id === id)!.cell(motor, u, i18n.t);

describe('motor grid precision', () => {
  it('tells a 29 mm motor from a 24 mm one in inches, as the detail does', () => {
    expect(col('diameter')).toBe('1.14');
    expect(inUserUnit(u, 'motorDimensions', motor.diameter, 0.001)).toBe('1.14 in');
  });

  it('picks the impulse decimals from the value shown, not the SI figure', () => {
    // 40 N·s is 8.99 lbf·s: under ten in the unit shown.
    expect(col('impulse')).toBe('8.99');
  });

  it('does not round a small propellant mass to nothing', () => {
    expect(col('prop')).not.toBe('0');
  });
});
