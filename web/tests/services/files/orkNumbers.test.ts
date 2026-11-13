import { describe, it, expect } from 'vitest';
import { finiteNum } from '../../../src/services/files/ork/numbers';

describe('finiteNum', () => {
  it.each([
    ['0.012', 0.012],
    [' -3.5e-2 ', -0.035],
    ['+7', 7],
    ['.5', 0.5],
  ])('reads %j as Java parseDouble does', (raw, v) => {
    expect(finiteNum(raw)).toBe(v);
  });

  it.each(['', '  ', '0x10', '0b1', '0o7', 'Infinity', 'NaN', '1 2', null, undefined])(
    'refuses %j, which Java parseDouble refuses or reads as not finite',
    (raw) => {
      expect(finiteNum(raw)).toBeUndefined();
    },
  );
});
