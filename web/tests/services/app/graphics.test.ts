import { afterEach, describe, expect, it } from 'vitest';
import { graphics3d } from '../../../src/services/app/graphics';

const g = globalThis as { __astraGraphics?: unknown };

afterEach(() => {
  delete g.__astraGraphics;
});

describe('graphics3d', () => {
  it('is on when the startup gate left no decision', () => {
    expect(graphics3d()).toEqual({ enabled: true, reason: null });
  });

  it('is on when the gate enabled 3D', () => {
    g.__astraGraphics = { enabled: true, reason: null, fps: 900 };
    expect(graphics3d()).toEqual({ enabled: true, reason: null });
  });

  it.each(['none', 'slow', 'off'] as const)('carries the %s reason when off', (reason) => {
    g.__astraGraphics = { enabled: false, reason };
    expect(graphics3d()).toEqual({ enabled: false, reason });
  });

  it('reads an unknown reason as no WebGL', () => {
    g.__astraGraphics = { enabled: false, reason: 'gremlins' };
    expect(graphics3d()).toEqual({ enabled: false, reason: 'none' });
  });
});
