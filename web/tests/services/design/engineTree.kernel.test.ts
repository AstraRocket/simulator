import { beforeAll, describe, expect, it, vi } from 'vitest';
import { __setEngineForTests, type RocketTree } from '../../../src/engine/openRocketEngine';
import { C6 } from '../../../src/engine/api';
import { freshWorkspace } from '../../../src/state/workspaceSelectors';
import { findMounts, updateNode } from '../../../src/services/design/treeEdit';
import { newFlightConfig } from '../../../src/services/flight/flightConfigs';
import { buildConfiguredRocket } from '../../../src/services/design/buildRocket';
import { loadEngine } from '../../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

beforeAll(async () => {
  __setEngineForTests(await loadEngine());
});

const { tree } = freshWorkspace();
const mounts = findMounts(tree);
const config = newFlightConfig(Object.fromEntries(mounts.map((m) => [m.id as string, { spec: C6 }])));
const hacked: RocketTree = { ...tree, baseDragHack: true };

describe('what the engine is sent', () => {
  it('moves the CP aft for static readouts with the base drag hack, at the same mass and CG', () => {
    const plain = buildConfiguredRocket(tree, config).staticInfo();
    const hack = buildConfiguredRocket(hacked, config).staticInfo();
    expect(hack.cp).toBeGreaterThan(plain.cp);
    expect(hack.mass).toBeCloseTo(plain.mass, 9);
    expect(hack.cg).toBeCloseTo(plain.cg, 9);
  });

  it('flies without the cone', () => {
    const plain = buildConfiguredRocket(tree, config, 'flight').staticInfo();
    const hack = buildConfiguredRocket(hacked, config, 'flight').staticInfo();
    expect(hack.cp).toBe(plain.cp);
  });

  it('builds without an ignored motor mount and the motor seated in it', () => {
    const id = mounts[0]!.id as string;
    const ignored = updateNode(tree, id, { ignored: true });
    const info = buildConfiguredRocket(ignored, config).staticInfo();
    expect(info.mass).toBeLessThan(buildConfiguredRocket(tree, config).staticInfo().mass);
  });
});

describe('what a person sees with the base drag hack on', () => {
  it('is the design as drawn: same length, no warning from the cone, no cone in the part rows', () => {
    const sweep = { machMin: 0.3, machMax: 0.3, machStep: 0.05 };
    // Read each build before the next: a build resets the engine and voids the handle before it.
    const read = (t: RocketTree) => {
      const r = buildConfiguredRocket(t, config);
      return {
        info: r.staticInfo(),
        masses: r.componentMasses().map((m) => m.name),
        aero: r.aeroSweep(sweep).components.map((c) => c.name),
      };
    };
    const a = read(tree);
    const b = read(hacked);
    expect(b.info.length).toBeCloseTo(a.info.length, 9);
    expect(b.info.lengthAerodynamic).toBeCloseTo(a.info.lengthAerodynamic, 9);
    expect(b.info.warningTexts).toEqual(a.info.warningTexts);
    expect(b.info.warnings).toBe(a.info.warnings);
    expect(b.masses).toEqual(a.masses);
    expect(b.aero).toEqual(a.aero);
  });
});
