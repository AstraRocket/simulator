// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/engine/simClient', async (orig) => ({
  ...(await orig<typeof import('../../src/engine/simClient')>()),
  simulateInWorker: vi.fn(),
}));

import { useWorkspaceStore } from '../../src/state/store';
import { C6 } from '../../src/engine/api';
import { simpleConfig, simpleRocketTree, SIMPLE_MOUNT_ID } from '../../src/services/flight/simpleRocket';

/**
 * "Open as a design" on the Tools tab's simple rocket: the rocket replaces the
 * open design as one of its own, with its motor in a configuration and a
 * simulation flying it from the tool's launch.
 */
describe('opening a simple rocket as a design', () => {
  it('opens the tree with its motor and launch, on the Design tab', async () => {
    useWorkspaceStore.getState().resetWorkspace();
    const inputs = { diameterM: 0.0248, lengthM: 0.45, dryMassKg: 0.04, mountDiameterM: 0.018, cgM: 0.25 };
    await useWorkspaceStore.getState().openNewDesign(simpleRocketTree(inputs, C6), simpleConfig(C6), {
      launchRodLengthM: 1.5,
      launchAltitudeM: 1200,
      temperatureC: 10,
    });
    const s = useWorkspaceStore.getState();
    expect(s.tab).toBe('design');
    expect(s.tree.components[0]!.overrideMass).toBe(0.04);
    expect(s.tree.components[0]!.overrideCGX).toBe(0.25);
    expect(s.tree.components[0]!.overrideSubcomponentsMass).toBe(true);
    expect(s.tree.components[0]!.overrideSubcomponentsCG).toBe(true);
    expect(s.configs).toHaveLength(1);
    expect(s.configs[0]!.motors[SIMPLE_MOUNT_ID]!.spec.designation).toBe('C6');
    expect(s.sims).toHaveLength(1);
    expect(s.sims[0]!.configId).toBe(s.configs[0]!.id);
    expect(s.sims[0]!.launch).toMatchObject({ launchRodLengthM: 1.5, launchAltitudeM: 1200, temperatureC: 10 });
  });
});
