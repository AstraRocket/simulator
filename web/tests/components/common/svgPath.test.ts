import { describe, expect, it } from 'vitest';
import { areaPath, polylinePath } from '../../../src/components/common/svgPath';
import { baselineArea, linePath } from '../../../src/components/sim/chartAxes';

describe('polylinePath', () => {
  it('writes either number style', () => {
    const pts = [
      [1, 2],
      [3, 4],
    ] as const;
    expect(polylinePath(pts)).toBe('M 1.0 2.0 L 3.0 4.0');
    expect(polylinePath(pts, 'comma')).toBe('M1.0,2.0 L3.0,4.0');
  });

  it('starts with M even when the first point is not finite', () => {
    // A `d` that starts with L is invalid, and the browser drops the whole path.
    expect(
      polylinePath([
        [NaN, 1],
        [1, 2],
        [3, 4],
      ]),
    ).toBe('M 1.0 2.0 L 3.0 4.0');
  });

  it('breaks the line at a gap instead of bridging it', () => {
    expect(
      polylinePath([
        [1, 1],
        [2, Infinity],
        [3, 3],
      ]),
    ).toBe('M 1.0 1.0 M 3.0 3.0');
  });

  it('breaks where the caller says the line jumps', () => {
    expect(
      polylinePath(
        [
          [1, 1],
          [2, 2],
          [3, 3],
        ],
        'space',
        (i) => i === 2,
      ),
    ).toBe('M 1.0 1.0 L 2.0 2.0 M 3.0 3.0');
  });
});

describe('linePath', () => {
  it('survives a NaN thrust sample', () => {
    const d = linePath(
      [
        [0, NaN],
        [1, 10],
        [2, 0],
      ],
      (t) => t * 10,
      (f) => 100 - f,
    );
    expect(d.startsWith('M')).toBe(true);
    expect(d).not.toContain('NaN');
  });
});

describe('areaPath', () => {
  it('closes the line down to the baseline at its first and last points', () => {
    expect(
      areaPath(
        [
          [1, 5],
          [2, 3],
        ],
        9,
        'comma',
      ),
    ).toBe('M1.0,9.0 L1.0,5.0 L2.0,3.0 L2.0,9.0 Z');
  });

  it('takes the ends it is given, and skips a non-finite point', () => {
    expect(
      areaPath(
        [
          [1, 5],
          [NaN, 4],
          [2, 3],
        ],
        9,
        'space',
        [0, 4],
      ),
    ).toBe('M 0.0 9.0 L 1.0 5.0 L 2.0 3.0 L 4.0 9.0 Z');
  });

  // The motor charts' area used to write a NaN point straight into the path,
  // which drops the whole fill.
  it('leaves a non-finite sample out of a motor chart area', () => {
    const d = baselineArea(
      [
        [0, 1],
        [1, NaN],
        [2, 2],
      ],
      (t) => t,
      (f) => -f,
      2,
    );
    expect(d).not.toContain('NaN');
  });

  it('draws nothing with no finite point', () => {
    expect(areaPath([[NaN, 1]], 0)).toBe('');
  });
});
