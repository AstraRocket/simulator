import { describe, it, expect } from 'vitest';
import { must } from '../../../src/services/app/must';

describe('must', () => {
  it('hands back a present value, including falsy ones', () => {
    expect(must(0, 'zero')).toBe(0);
    expect(must('', 'empty')).toBe('');
    expect(must(false, 'false')).toBe(false);
  });

  it('names what was missing', () => {
    expect(() => must(null, 'part node')).toThrow('Missing part node');
    expect(() => must(undefined, 'part parent')).toThrow('Missing part parent');
  });
});
