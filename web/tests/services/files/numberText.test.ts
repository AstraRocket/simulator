import { describe, it, expect } from 'vitest';
import { plainDecimal, plainSig, readDecimal } from '../../../src/services/files/numberText';

/**
 * Locale-free decimal text for a file. Each writer picks its precision and what
 * a non-finite value becomes, rather than "NaN" landing in the file.
 */
describe('plainDecimal', () => {
  it('rounds to the given places and drops the trailing zeros', () => {
    expect(plainDecimal(1.23456789, 6)).toBe('1.234568');
    expect(plainDecimal(0.125, 4)).toBe('0.125');
    expect(plainDecimal(2, 4)).toBe('2');
  });

  it('never writes a negative zero', () => {
    expect(plainDecimal(-0.0000001, 6)).toBe('0');
    expect(plainDecimal(-0, 4)).toBe('0');
  });

  it('writes the caller chosen text for a non-finite value', () => {
    expect(plainDecimal(Number.NaN, 6)).toBe('');
    expect(plainDecimal(Number.POSITIVE_INFINITY, 6, '0')).toBe('0');
  });
});

describe('plainSig', () => {
  it('rounds to significant figures as a plain decimal, never an exponent', () => {
    expect(plainSig(0.425, 4)).toBe('0.425');
    expect(plainSig(24993, 4)).toBe('24990');
    expect(plainSig(9.3e-6, 4)).toBe('0.0000093');
    expect(plainSig(1.23456789e-7, 6)).toBe('0.000000123457');
  });

  it('writes zero and negative zero as 0', () => {
    expect(plainSig(0, 4)).toBe('0');
    expect(plainSig(-0, 6)).toBe('0');
  });

  it('writes the stand-in the caller gives for a non-finite value', () => {
    expect(plainSig(Number.NaN, 4)).toBe('');
    expect(plainSig(Infinity, 4, '0')).toBe('0');
  });
});

describe('readDecimal', () => {
  it('reads plain decimals: signs, a leading or trailing dot, exponents', () => {
    expect(readDecimal('2.5')).toBe(2.5);
    expect(readDecimal('-3')).toBe(-3);
    expect(readDecimal('+4')).toBe(4);
    expect(readDecimal('.5')).toBe(0.5);
    expect(readDecimal('5.')).toBe(5);
    expect(readDecimal('1e3')).toBe(1000);
    expect(readDecimal('2.5E-3')).toBe(0.0025);
    expect(readDecimal('  18 ')).toBe(18);
  });

  it('refuses hexadecimal, binary and octal, which Number() would read', () => {
    expect(readDecimal('0x10')).toBeNaN();
    expect(readDecimal('0b110')).toBeNaN();
    expect(readDecimal('0o7')).toBeNaN();
  });

  it('refuses a blank, which Number() reads as 0, and the words', () => {
    expect(readDecimal('')).toBeNaN();
    expect(readDecimal('   ')).toBeNaN();
    expect(readDecimal('Infinity')).toBeNaN();
    expect(readDecimal('NaN')).toBeNaN();
    expect(readDecimal('1,5')).toBeNaN();
    expect(readDecimal('.')).toBeNaN();
  });
});
