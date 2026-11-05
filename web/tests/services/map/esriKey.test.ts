// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { esriKeyStore, useEsriKey } from '../../../src/services/map/esriKey';
import { TILE_SOURCES } from '../../../src/services/map/slippyMap';

describe('the Esri key', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reads as none until one is saved, trimmed, and is forgotten when cleared', () => {
    expect(esriKeyStore.read()).toBeUndefined();
    expect(esriKeyStore.write('  test-key  ')).toBe(true);
    expect(esriKeyStore.read()).toBe('test-key');
    expect(esriKeyStore.write('   ')).toBe(true);
    expect(esriKeyStore.read()).toBeUndefined();
  });

  it('is told to an open map the moment it is saved', () => {
    const { result } = renderHook(() => useEsriKey());
    expect(result.current).toBeUndefined();
    act(() => {
      esriKeyStore.write('test-key');
    });
    expect(result.current).toBe('test-key');
  });
  it('goes on every tile as a token, and only when there is one', () => {
    for (const source of Object.values(TILE_SOURCES)) {
      expect(source.url(15, 1, 2)).not.toContain('?');
      expect(source.url(15, 1, 2, 'test-key')).toMatch(/\/tile\/15\/2\/1\?token=test-key$/);
      expect(source.url(15, 1, 2, 'a&b=c')).toMatch(/\?token=a%26b%3Dc$/);
    }
  });
});
