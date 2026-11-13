import { describe, it, expect } from 'vitest';
import { finiteOr, isFiniteNumber, isRecord, roundTo } from '../../../src/services/app/numbers';

describe('roundTo', () => {
  it('rounds to the given places with Math.round', () => {
    expect(roundTo(12.345, 1)).toBe(Math.round(12.345 * 10) / 10);
    expect(roundTo(0.1234567, 6)).toBe(Math.round(0.1234567 * 1e6) / 1e6);
    expect(roundTo(-2.5, 0)).toBe(-2);
  });
});

describe('isFiniteNumber', () => {
  it('accepts a real number and nothing else', () => {
    expect(isFiniteNumber(1.5)).toBe(true);
    for (const v of [Number.NaN, Infinity, '1', null, undefined]) expect(isFiniteNumber(v)).toBe(false);
  });
});

describe('finiteOr', () => {
  it('keeps a real number, 0 included, and gives the fallback for anything else', () => {
    expect(finiteOr(0, null)).toBe(0);
    expect(finiteOr(-2.5, 7)).toBe(-2.5);
    for (const v of [Number.NaN, Infinity, '1', null, undefined]) expect(finiteOr(v, null)).toBeNull();
    expect(finiteOr(undefined, 0)).toBe(0);
  });
});

describe('isRecord', () => {
  it('takes a plain object and refuses null, an array and a primitive', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord('x')).toBe(false);
  });
});
