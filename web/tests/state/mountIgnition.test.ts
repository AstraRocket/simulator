import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/engine/simClient', async (orig) => ({
  ...(await orig<typeof import('../../src/engine/simClient')>()),
  simulateInWorker: vi.fn(),
}));

import { useWorkspaceStore } from '../../src/state/store';
import { findMounts, findNode } from '../../src/services/design/treeEdit';

// Desktop: `new MotorConfiguration(mount, fcid, mount.getMotorConfig(fcid))` starts from the mount's ignition.

const s = () => useWorkspaceStore.getState();
const mountId = () => findMounts(s().tree)[0]!.id as string;
const mount = () => findNode(s().tree, mountId())!;
const motorIn = (configId: string) => s().configs.find((c) => c.id === configId)!.motors[mountId()]!;

beforeEach(() => s().resetWorkspace());

describe('mount ignition', () => {
  it('lights a configuration made after it, and a motor still on its old ignition, the way the mount says', () => {
    const first = s().configs[0]!.id;
    s().setSelectedId(mountId());
    s().patchSelected({ ignitionEvent: 'burnout', ignitionDelay: 2 });
    s().commitEdit();
    s().addConfig();
    const made = s().selectedConfigId!;
    expect(motorIn(made)).toMatchObject({ ignitionEvent: 'burnout', ignitionDelay: 2 });
    expect(motorIn(first)).toMatchObject({ ignitionEvent: 'burnout', ignitionDelay: 2 });
  });

  it('changes every configuration and the mount on "all", as one undo step', () => {
    const first = s().configs[0]!.id;
    s().addConfig();
    const second = s().selectedConfigId!;
    const steps = s().past.length;
    s().setMountIgnition(first, mountId(), 'launch', 1.5, 'all');
    s().commitEdit();
    expect(motorIn(first)).toMatchObject({ ignitionEvent: 'launch', ignitionDelay: 1.5 });
    expect(motorIn(second)).toMatchObject({ ignitionEvent: 'launch', ignitionDelay: 1.5 });
    expect(mount()).toMatchObject({ ignitionEvent: 'launch', ignitionDelay: 1.5 });
    expect(s().past).toHaveLength(steps + 1);

    s().undo();
    expect(motorIn(first).ignitionEvent).toBeUndefined();
    expect(motorIn(second).ignitionEvent).toBeUndefined();
    expect(mount()['ignitionEvent']).toBeUndefined();
  });

  it('changes only the one configuration, and not the mount, otherwise', () => {
    const first = s().configs[0]!.id;
    s().addConfig();
    const second = s().selectedConfigId!;
    s().setMountIgnition(second, mountId(), 'never', 0);
    s().commitEdit();
    expect(motorIn(second).ignitionEvent).toBe('never');
    expect(motorIn(first).ignitionEvent).toBeUndefined();
    expect(mount()['ignitionEvent']).toBeUndefined();
  });

  it('records no step when "all" asks for automatic with no delay on a mount that states none', () => {
    const steps = s().past.length;
    s().setMountIgnition(s().configs[0]!.id, mountId(), 'automatic', 0, 'all');
    s().commitEdit();
    expect(s().past).toHaveLength(steps);
    expect(mount()['ignitionEvent']).toBeUndefined();
  });

  it('records no step when "all" changes nothing', () => {
    s().setMountIgnition(s().configs[0]!.id, mountId(), 'burnout', 1, 'all');
    s().commitEdit();
    const steps = s().past.length;
    s().setMountIgnition(s().configs[0]!.id, mountId(), 'burnout', 1, 'all');
    s().commitEdit();
    expect(s().past).toHaveLength(steps);
  });
});
