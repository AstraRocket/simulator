import { describe, expect, it } from 'vitest';
import { nameTaken, sameName } from '../../../src/services/app/names';

describe('nameTaken', () => {
  it('matches ignoring case and surrounding space', () => {
    expect(sameName(' Home Field ', 'home field')).toBe(true);
    expect(nameTaken('HOME', ['home '])).toBe(true);
    expect(nameTaken('Away', ['home'])).toBe(false);
  });

  it('never calls a blank name taken', () => {
    expect(nameTaken('  ', ['', ' '])).toBe(false);
  });
});
