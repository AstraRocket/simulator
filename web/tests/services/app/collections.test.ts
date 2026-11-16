import { describe, expect, it } from 'vitest';
import { distinctSorted, groupBy, withMember } from '../../../src/services/app/collections';

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

describe('withMember', () => {
  it('adds or removes as asked, leaving the source untouched', () => {
    const src = new Set(['a']);
    expect([...withMember(src, 'b', true)]).toEqual(['a', 'b']);
    expect([...withMember(src, 'a', false)]).toEqual([]);
    expect([...withMember(src, 'a', true)]).toEqual(['a']);
    expect([...src]).toEqual(['a']);
  });
});
