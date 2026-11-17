import { describe, it, expect } from 'vitest';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';
import { recoveryDensityOutliers, treeRecoveryDensityOutliers } from '../../../src/services/design/recoveryDensity';

const node = (type: string, fields: Record<string, unknown>): ComponentNode =>
  ({ type, id: `${type}-1`, ...fields }) as ComponentNode;

describe('recovery material densities far outside real materials', () => {
  it('flags the 90 kg/m² paper streamer the parts file shipped', () => {
    const out = recoveryDensityOutliers(node('streamer', { surfaceDensity: 90 }));
    expect(out.map((o) => [o.material, o.density])).toEqual([['surface', 90]]);
  });

  it('flags a canopy a thousand times too light and its line separately', () => {
    const chute = node('parachute', { surfaceDensity: 0.00006685, lineDensity: 2 });
    expect(recoveryDensityOutliers(chute).map((o) => o.material)).toEqual(['surface', 'line']);
  });

  it('flags a shock cord by its line density', () => {
    expect(recoveryDensityOutliers(node('shockcord', { lineDensity: 5 }))).toHaveLength(1);
  });

  it.each([
    ['ripstop nylon', 'parachute', { surfaceDensity: 0.067, lineDensity: 0.0018 }],
    ['office paper', 'streamer', { surfaceDensity: 0.08 }],
    ['a weightless line', 'parachute', { surfaceDensity: 0.067, lineDensity: 0 }],
    ['no stated material', 'streamer', {}],
  ])('leaves %s alone', (_what, type, fields) => {
    expect(recoveryDensityOutliers(node(type, fields))).toEqual([]);
  });

  it('ignores a bulk density on a part that has no recovery material', () => {
    expect(recoveryDensityOutliers(node('bodytube', { density: 90, surfaceDensity: 90 }))).toEqual([]);
  });

  it('finds the outliers anywhere in the tree', () => {
    const tree = {
      components: [
        node('stage', {
          children: [node('bodytube', { children: [node('streamer', { surfaceDensity: 90 })] })],
        }),
      ],
    };
    expect(treeRecoveryDensityOutliers(tree).map((o) => o.node.type)).toEqual(['streamer']);
  });
});
