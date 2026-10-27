import { describe, expect, it } from 'vitest';
import { compareSortKeys } from '../../../src/services/app/sortKeys';

describe('compareSortKeys', () => {
  const sorted = (keys: (number | string | null)[], dir: 1 | -1) =>
    [...keys].sort((a, b) => compareSortKeys(a, b, dir));

  it('puts a missing, non-finite or empty key last in both directions', () => {
    expect(sorted([2, null, Number.NaN, 1], 1)).toEqual([1, 2, null, Number.NaN]);
    expect(sorted([2, null, 1], -1)).toEqual([2, 1, null]);
    expect(sorted(['b', '', 'a'], -1)).toEqual(['b', 'a', '']);
  });

  it('compares a mix of text and numbers as text', () => {
    expect(sorted(['10', 9], 1)).toEqual(['10', 9]);
  });
});
