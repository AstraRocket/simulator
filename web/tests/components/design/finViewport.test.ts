import { describe, it, expect } from 'vitest';
import { finViewport, type Pt } from '../../../src/components/design/finViewport';

describe('finViewport', () => {
  const pts: Pt[] = [
    [0, 0],
    [0.02, 0.05],
    [0.05, 0.05],
    [0.06, 0],
  ];

  it('maps a view position back to the point it came from', () => {
    const view = finViewport(pts);
    for (const [x, y] of pts) {
      const [bx, by] = view.fromView(view.sx(x), view.sy(y));
      expect(bx).toBeCloseTo(x, 9);
      expect(by).toBeCloseTo(y, 9);
    }
  });

  it('keeps the outline inside the padded viewBox', () => {
    const { W, H, PAD, sx, sy } = finViewport(pts);
    for (const [x, y] of pts) {
      expect(sx(x)).toBeGreaterThanOrEqual(PAD - 1e-9);
      expect(sx(x)).toBeLessThanOrEqual(W - PAD + 1e-9);
      expect(sy(y)).toBeGreaterThanOrEqual(PAD - 1e-9);
      expect(sy(y)).toBeLessThanOrEqual(H - PAD + 1e-9);
    }
  });

  it('keeps x = 0 in view when a leading edge sweeps forward', () => {
    const { sx, PAD } = finViewport([
      [-0.02, 0.03],
      [0.04, 0],
    ]);
    expect(sx(-0.02)).toBeCloseTo(PAD, 9);
    expect(sx(0)).toBeGreaterThan(PAD);
  });

  it('draws a flat, zero-size outline without dividing by zero', () => {
    const { sx, sy } = finViewport([
      [0, 0],
      [0, 0],
    ]);
    expect(Number.isFinite(sx(0))).toBe(true);
    expect(Number.isFinite(sy(0))).toBe(true);
  });
});
