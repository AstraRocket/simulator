import { describe, it, expect } from 'vitest';
import { compareSortKeys } from '../../../src/services/app/sortKeys';

describe('compareSortKeys', () => {
  const sorted = (keys: (number | string)[], dir: 1 | -1) => [...keys].sort((a, b) => compareSortKeys(a, b, dir));

  it('puts unknown numbers last on ascending and on descending', () => {
    expect(sorted([3, NaN, 1, 2], 1)).toEqual([1, 2, 3, NaN]);
    expect(sorted([3, NaN, 1, 2], -1)).toEqual([3, 2, 1, NaN]);
  });

  it('puts empty strings last on ascending and on descending', () => {
    expect(sorted(['b', '', 'a'], 1)).toEqual(['a', 'b', '']);
    expect(sorted(['b', '', 'a'], -1)).toEqual(['b', 'a', '']);
  });
});
