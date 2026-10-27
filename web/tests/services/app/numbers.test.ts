import { describe, it, expect } from 'vitest';
import { isFiniteNumber, isRecord, roundTo } from '../../../src/services/app/numbers';

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

describe('isRecord', () => {
  it('takes a plain object and refuses null, an array and a primitive', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord('x')).toBe(false);
  });
});
