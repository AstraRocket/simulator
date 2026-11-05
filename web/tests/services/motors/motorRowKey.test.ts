import { describe, it, expect } from 'vitest';
import { keyOf } from '../../../src/services/motors/motorKey';
// @ts-expect-error - a plain .mjs build script helper, no types
import { motorRowKey, collidingRowKeys } from '../../../scripts/lib/motorRowKey.mjs';
import type { CatalogMotor } from '../../../src/services/motors/motorDb';

// The sync script is plain `.mjs` and cannot import `keyOf`, so this pins its copy.
const motor = (o: Partial<CatalogMotor>): CatalogMotor =>
  ({ manufacturer: 'Estes', designation: 'C6', diameter: 0.018, code: 'C6', ...o }) as CatalogMotor;

describe('the motor row key has one definition', () => {
  const cases: CatalogMotor[] = [
    motor({}),
    motor({ code: undefined }),
    motor({ manufacturer: 'LOC/Precision', designation: '1/2A3' }),
    motor({ diameter: 0.0295 }),
    motor({ designation: 'H128W', code: 'H128' }),
    motor({ manufacturer: '', designation: '', diameter: 0, code: '' }),
  ];

  it('agrees with the app for every shape the catalog carries', () => {
    for (const m of cases) {
      expect(motorRowKey(m), JSON.stringify(m)).toBe(keyOf(m));
    }
  });

  it('treats a missing code and an empty code as the same key, as the app does', () => {
    expect(motorRowKey(motor({ code: undefined }))).toBe(motorRowKey(motor({ code: '' })));
    expect(keyOf(motor({ code: undefined }))).toBe(keyOf(motor({ code: '' })));
  });
});

describe('collidingRowKeys', () => {
  it('finds nothing in a clean catalog', () => {
    expect(collidingRowKeys([motor({ designation: 'A' }), motor({ designation: 'B' })])).toEqual([]);
  });

  it('names each colliding key once, however many motors share it', () => {
    const dupe = motor({ designation: 'X' });
    expect(collidingRowKeys([dupe, dupe, dupe, motor({ designation: 'Y' })])).toEqual([keyOf(dupe)]);
  });

  it('separates motors that differ only in code', () => {
    expect(collidingRowKeys([motor({ code: 'C6-3' }), motor({ code: 'C6-5' })])).toEqual([]);
  });

  it('is what refuses a publish, so it must see a real collision', () => {
    const a = motor({ manufacturer: 'A', designation: 'X', diameter: 0.018, code: undefined });
    const b = motor({ manufacturer: 'A', designation: 'X', diameter: 0.018, code: '' });
    expect(collidingRowKeys([a, b])).toEqual([keyOf(a)]);
  });
});
