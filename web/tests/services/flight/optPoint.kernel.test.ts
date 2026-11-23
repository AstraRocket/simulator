import { beforeAll, describe, expect, it, vi } from 'vitest';
import { __setEngineForTests } from '../../../src/engine/openRocketEngine';
import { C6 } from '../../../src/engine/api';
import { freshWorkspace } from '../../../src/state/workspaceSelectors';
import { findMounts } from '../../../src/services/design/treeEdit';
import { newFlightConfig } from '../../../src/services/flight/flightConfigs';
import { buildConfiguredRocket } from '../../../src/services/design/buildRocket';
import { evaluateOptPoint } from '../../../src/services/flight/optimizer/optPoint';
import { loadEngine } from '../../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

beforeAll(async () => {
  __setEngineForTests(await loadEngine());
});

const { tree } = freshWorkspace();
const config = newFlightConfig(Object.fromEntries(findMounts(tree).map((m) => [m.id as string, { spec: C6 }])));
const options = { launchRodLength: 1, randomSeed: 7, series: 'summary' as const };

describe('one optimizer point, through the kernel', () => {
  it('reads the stability the design panel shows and flies the figures the goals need', () => {
    const p = evaluateOptPoint({ tree, config, options, limits: null, fly: true });
    const info = buildConfiguredRocket(tree, config).staticInfo();
    expect(p.static.calibers).toBe(info.stabilityCalibers);
    expect(p.static.cp - p.static.cg).toBeCloseTo(info.cp - info.cg, 9);
    expect(p.figures?.apogee).toBeGreaterThan(0);
    expect(p.figures?.flightTime).toBeGreaterThan(0);
    expect(p.figures?.landingDistance).toBeGreaterThanOrEqual(0);
  });

  it('flies nothing outside the stability limits', () => {
    const p = evaluateOptPoint({ tree, config, options, limits: { min: 99, max: null, unit: 'calibers' }, fly: true });
    expect(p.distance).toBeGreaterThan(0);
    expect(p.figures).toBeNull();
  });
});
