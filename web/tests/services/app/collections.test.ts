import { describe, expect, it } from 'vitest';
import { distinctSorted, groupBy } from '../../../src/services/app/collections';

describe('distinctSorted', () => {
  it('lists each value once, alphabetically, skipping items with none', () => {
    const items = [{ k: 'b' }, { k: 'a' }, { k: undefined }, { k: 'b' }, { k: null }];
    expect(distinctSorted(items, (i) => i.k)).toEqual(['a', 'b']);
  });
});

describe('groupBy', () => {
  it('keeps first-seen group order and input order within a group', () => {
    const g = groupBy(['b1', 'a1', 'b2', 'a2'], (s) => s[0]);
    expect([...g.entries()]).toEqual([
      ['b', ['b1', 'b2']],
      ['a', ['a1', 'a2']],
    ]);
  });
});
