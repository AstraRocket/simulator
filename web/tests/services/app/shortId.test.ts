import { describe, expect, it } from 'vitest';
import { shortId } from '../../../src/services/app/uuid';

describe('shortId', () => {
  it('keeps the shape each store already holds', () => {
    expect(shortId('d', 6)).toMatch(/^d[0-9a-z]+$/);
    expect(shortId('custom:', 8, ':')).toMatch(/^custom:[0-9a-z]+:[0-9a-z]{1,8}$/);
  });

  it('does not repeat itself', () => {
    expect(shortId('t', 8)).not.toBe(shortId('t', 8));
  });
});
