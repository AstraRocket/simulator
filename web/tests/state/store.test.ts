import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const simulateMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/engine/simClient', async (orig) => ({
  ...(await orig<typeof import('../../src/engine/simClient')>()),
  simulateInWorker: simulateMock,
}));

import {
  useWorkspaceStore,
  selectActive,
  selectConfig,
  configOf,
  selectRunIds,
  selectRunFailed,
  selectEditedConfig,
  workspaceSnapshot,
} from '../../src/state/store';
import { C6 } from '../../src/engine/api';
import { setDesignLibrary } from '../../src/services/storage/designLibrary';
import { useConfirmStore } from '../../src/state/confirmStore';
import { usePromptStore } from '../../src/state/promptStore';
import { getWorkspaceStore, type Workspace } from '../../src/services/storage/workspaceStore';
import {
  findMounts,
  findNode,
  findRecoveryDevices,
  findSeparators,
  findStages,
} from '../../src/services/design/treeEdit';
import { seatMotor, CURVELESS } from '../testing/seatMotor';
import { asFlown, isStale } from '../testing/flown';
import type { FlightResult } from '../../src/engine/openRocketEngine';
import { hasThrustCurve } from '../../src/services/flight/runnability';
import { reconcileConfigs } from '../../src/services/flight/flightConfigs';

const s = () => useWorkspaceStore.getState();
const len = (id: string): number | undefined => findNode(s().tree, id)?.length as number | undefined;
const active = () => selectActive(s());
const config = () => selectConfig(s());
const mountId = () => findMounts(s().tree)[0]!.id as string;
const seated = () => config().motors[mountId()]!.spec;

// Unconsumed `...Once` values would leak into the next test.
beforeEach(() => simulateMock.mockReset());

describe('workspace undo/redo', () => {
  beforeEach(() => {
    s().resetWorkspace();
    s().setSelectedId('nose');
  });

  it('starts with an empty history', () => {
    expect(s().past).toHaveLength(0);
    expect(s().future).toHaveLength(0);
  });

  it('coalesces one interaction (many patches + a commit) into a single undo step', () => {
    const before = len('nose');
    s().patchSelected({ length: 0.2 });
    s().patchSelected({ length: 0.3 });
    s().patchSelected({ length: 0.42 });
    s().commitEdit();
    expect(s().past).toHaveLength(1);
    expect(len('nose')).toBe(0.42);

    s().undo();
    expect(len('nose')).toBe(before);
    expect(s().past).toHaveLength(0);
    expect(s().future).toHaveLength(1);
  });

  it('restores the prior selection on undo', () => {
    s().setSelectedId('body');
    s().patchSelected({ length: 0.9 });
    s().commitEdit();
    s().setSelectedId('nose');
    s().undo();
    expect(s().selectedId).toBe('body');
  });

  it('undoes an add and a remove, reselecting what changed', () => {
    s().setSelectedId('body');
    s().addPartToTree('trapezoidfinset');
    const addedId = s().selectedId!;
    expect(findNode(s().tree, addedId)).toBeTruthy();
    s().undo();
    expect(findNode(s().tree, addedId)).toBeNull();

    s().setSelectedId('fins');
    s().removeSelected();
    expect(findNode(s().tree, 'fins')).toBeNull();
    s().undo();
    expect(findNode(s().tree, 'fins')).toBeTruthy();
    expect(s().selectedId).toBe('fins');
  });

  it('adds a stage as a new bottom sibling, selects it, and undoes cleanly', () => {
    const stageCount = () => s().tree.components.filter((n) => n.type === 'stage').length;
    const before = stageCount();
    s().addStageToTree();
    const stages = s().tree.components.filter((n) => n.type === 'stage');
    expect(stages).toHaveLength(before + 1);
    expect(s().selectedId).toBe(stages[stages.length - 1]!.id);
    s().undo();
    expect(stageCount()).toBe(before);
  });

  it('redoes, and a fresh edit clears the redo stack', () => {
    s().patchSelected({ length: 0.25 });
    s().commitEdit();
    s().undo();
    expect(s().future).toHaveLength(1);
    s().redo();
    expect(len('nose')).toBe(0.25);
    expect(s().future).toHaveLength(0);

    s().undo();
    expect(s().future).toHaveLength(1);
    s().patchSelected({ length: 0.11 });
    s().commitEdit();
    expect(s().future).toHaveLength(0);
  });

  it('undo folds an uncommitted in-flight edit into one step', () => {
    const before = len('nose');
    s().patchSelected({ length: 0.5 }); // no commitEdit: Ctrl+Z mid-edit
    s().undo();
    expect(len('nose')).toBe(before);
    expect(s().past).toHaveLength(0);
  });

  it('clears history when the workspace is reset', () => {
    s().patchSelected({ length: 0.2 });
    s().commitEdit();
    expect(s().past).toHaveLength(1);
    s().resetWorkspace();
    expect(s().past).toHaveLength(0);
    expect(s().future).toHaveLength(0);
  });
});

describe('design metadata (Rocket configuration)', () => {
  beforeEach(() => {
    s().resetWorkspace();
  });

  it('patches the tree metadata as a single undo step', () => {
    const before = s().tree.name;
    s().updateDesignMeta({
      name: 'My Rocket',
      designer: 'Ada',
      comment: 'shear-pin notes',
      revision: 'r1',
      designType: 'clone_kit',
    });
    expect(s().tree.name).toBe('My Rocket');
    expect(s().tree.designer).toBe('Ada');
    expect(s().tree.comment).toBe('shear-pin notes');
    expect(s().tree.revision).toBe('r1');
    expect(s().tree.designType).toBe('clone_kit');
    expect(s().past).toHaveLength(1);

    s().undo();
    expect(s().tree.name).toBe(before);
    expect(s().tree.designer).toBeUndefined();
    expect(s().tree.comment).toBeUndefined();
  });

  it('merges a partial patch, leaving untouched fields in place', () => {
    s().updateDesignMeta({ designer: 'Ada' });
    s().updateDesignMeta({ revision: 'r2' });
    expect(s().tree.designer).toBe('Ada');
    expect(s().tree.revision).toBe('r2');
    expect(s().past).toHaveLength(2);
  });
});

describe('simulation undo/redo', () => {
  beforeEach(() => {
    s().resetWorkspace();
  });

  it('undoes a motor change', () => {
    const before = seated().designation;
    s().setMountMotor(config().id, mountId(), { ...C6, designation: 'Z99' });
    expect(seated().designation).toBe('Z99');
    expect(s().past).toHaveLength(1);
    s().undo();
    expect(seated().designation).toBe(before);
  });

  it('records no step for a motor change on a configuration that is not there', () => {
    s().setMountMotor('no-such-config', mountId(), { ...C6, designation: 'Z99' });
    expect(s().past).toHaveLength(0);
  });

  it('records no step and keeps redo when the same motor is seated again', () => {
    s().setMountMotor(config().id, mountId(), { ...C6, designation: 'Z99' });
    s().undo();
    expect(s().future).toHaveLength(1);
    const again = seated();
    s().setMountMotor(config().id, mountId(), { ...again, times: [...again.times] });
    expect(s().past).toHaveLength(0);
    expect(s().future).toHaveLength(1);
  });

  it('records no step for ignition timing the mount already has', () => {
    s().setMountIgnition(config().id, mountId(), 'automatic', 0);
    s().commitEdit();
    expect(s().past).toHaveLength(0);
    s().setMountIgnition(config().id, mountId(), 'burnout', 1);
    s().commitEdit();
    s().setMountIgnition(config().id, mountId(), 'burnout', 1);
    s().commitEdit();
    expect(s().past).toHaveLength(1);
  });

  it('redo keeps an edit that is still in flight', () => {
    s().patchLaunch({ windAverage: 3 });
    s().commitEdit();
    s().undo();
    expect(s().future).toHaveLength(1);
    s().patchLaunch({ windAverage: 7 });
    s().redo();
    expect(active().launch.windAverage).toBe(7);
    s().commitEdit();
    s().undo();
    expect(active().launch.windAverage).not.toBe(7);
  });

  it('coalesces a launch edit and undoes it in one step', () => {
    const before = active().launch.launchRodAngleDeg;
    s().patchLaunch({ launchRodAngleDeg: 5 });
    s().patchLaunch({ launchRodAngleDeg: 12 });
    s().commitEdit();
    expect(s().past).toHaveLength(1);
    expect(active().launch.launchRodAngleDeg).toBe(12);
    s().undo();
    expect(active().launch.launchRodAngleDeg).toBe(before);
  });

  it('leaves a result current when only the weather stamp changes, and ages it when a value does', () => {
    useWorkspaceStore.setState((st) => ({
      sims: st.sims.map((x) => ({ ...x, result: { summary: {} } as never })).map((x) => asFlown(st, x)),
    }));
    const stamp = {
      provider: 'open-meteo',
      endpoint: 'forecast',
      date: '2026-10-05',
      hour: 12,
      timezone: 'America/Denver',
      latitudeDeg: 40,
      longitudeDeg: -105,
      elevationM: 1500,
      validAt: '2026-10-05T18:00:00.000Z',
      fetchedAt: '2026-10-04T15:00:00.000Z',
      groups: ['temperature'],
      elevationApplied: false,
    } as const;
    s().patchLaunch({ weatherSource: { ...stamp, groups: [...stamp.groups] } });
    expect(isStale(active())).toBe(false);
    s().patchLaunch({ weatherSource: { ...stamp, groups: [...stamp.groups], fetchedAt: '2026-10-04T18:00:00.000Z' } });
    expect(isStale(active())).toBe(false);
    s().patchLaunch({ temperatureC: 3 });
    expect(isStale(active())).toBe(true);
  });

  it('undoes add / rename / delete of a simulation and restores the active sim', () => {
    const firstId = active().id;
    s().addSim();
    expect(s().sims).toHaveLength(2);
    s().undo();
    expect(s().sims).toHaveLength(1);
    expect(s().activeId).toBe(firstId);

    s().renameSim(firstId, 'Windy day');
    s().commitEdit();
    s().undo();
    expect(s().sims.find((x) => x.id === firstId)!.name).not.toBe('Windy day');

    s().addSim();
    const addedId = active().id;
    expect(s().sims).toHaveLength(2);
    s().deleteSim(addedId);
    expect(s().sims).toHaveLength(1);
    s().undo();
    expect(s().sims).toHaveLength(2);
  });

  it('does not record history when just switching the active sim', () => {
    s().addSim();
    const firstId = s().sims[0]!.id;
    const before = s().past.length;
    s().setActiveId(firstId);
    expect(s().past).toHaveLength(before);
  });

  it('strips cached flight results from history snapshots', () => {
    const fake = { series: {}, events: [] } as unknown as FlightResult;
    const id = active().id;
    useWorkspaceStore.setState({ sims: s().sims.map((x) => (x.id === id ? { ...x, result: fake } : x)) });
    s().addSim();
    expect(s().past[0]!.sims.every((x) => x.result === null)).toBe(true);
  });

  it('shares one timeline with tree edits', () => {
    s().setSelectedId('nose');
    s().patchSelected({ length: 0.3 });
    s().commitEdit();
    s().setMountMotor(config().id, mountId(), { ...C6, designation: 'Q1' });
    expect(s().past).toHaveLength(2);
    s().undo();
    expect(seated().designation).not.toBe('Q1');
    s().undo();
    expect(findNode(s().tree, 'nose')!.length).not.toBe(0.3);
  });
});

describe('mount to motor reconciliation', () => {
  beforeEach(() => {
    s().resetWorkspace();
  });

  const motors = () => config().motors;

  it('seeds a default motor when a second mount is added', () => {
    expect(Object.keys(motors())).toHaveLength(1);
    s().setSelectedId('body');
    s().addPartToTree('innertube');
    const added = s().selectedId!;
    expect(Object.keys(motors())).toHaveLength(2);
    expect(motors()[added]!.spec.designation).toBe('C6');
  });

  it('drops the entry when its mount is removed', () => {
    s().setSelectedId('body');
    s().addPartToTree('innertube');
    const addedId = s().selectedId!;
    expect(motors()[addedId]).toBeDefined();
    s().removeSelected();
    expect(motors()[addedId]).toBeUndefined();
  });

  it('undo restores the mounts and their motors together', () => {
    s().setSelectedId('body');
    s().addPartToTree('innertube');
    const addedId = s().selectedId!;
    s().undo();
    expect(findNode(s().tree, addedId)).toBeNull();
    expect(motors()[addedId]).toBeUndefined();
  });

  it('seeds the new mount into EVERY configuration, not just the active one', () => {
    s().addConfig();
    s().setSelectedId('body');
    s().addPartToTree('innertube');
    const addedId = s().selectedId!;
    expect(s().configs.length).toBeGreaterThan(1);
    expect(s().configs.every((c) => !!c.motors[addedId])).toBe(true);

    s().removeSelected();
    expect(s().configs.every((c) => !c.motors[addedId])).toBe(true);
  });
});

describe('a simulation flies one configuration', () => {
  beforeEach(() => {
    s().resetWorkspace();
    s().setSelectedId('body');
    s().addPartToTree('innertube');
  });

  const seatedIn = (simId: string, mount: string) =>
    configOf(
      s().configs,
      s().sims.find((x) => x.id === simId)!,
    ).motors[mount]!.spec.designation;

  it('seats a motor for every row flying that configuration', () => {
    const mount = s().selectedId!;
    const first = s().activeId;
    s().addSim();
    const second = s().activeId;
    expect(second).not.toBe(first);
    const shared = config().id;
    expect(configOf(s().configs, s().sims[0]!).id).toBe(shared);

    s().setMountMotor(shared, mount, { ...C6, designation: 'D12' });

    expect(seatedIn(second, mount)).toBe('D12');
    expect(seatedIn(first, mount)).toBe('D12');
  });

  it('leaves a row that flies another configuration alone', () => {
    const mount = s().selectedId!;
    const first = s().activeId;
    s().addSim();
    const second = s().activeId;
    s().addConfig();
    const own = s().selectedConfigId!;
    s().setSimConfig(second, own);

    s().setMountMotor(own, mount, { ...C6, designation: 'D12' });

    expect(seatedIn(second, mount)).toBe('D12');
    expect(seatedIn(first, mount)).toBe('C6');
  });

  it('ages every flight flown on the configuration that changed', () => {
    const mount = s().selectedId!;
    const first = s().activeId;
    s().addSim();
    const second = s().activeId;
    s().addConfig();
    s().setSimConfig(second, s().selectedConfigId!);
    useWorkspaceStore.setState((st) => ({
      sims: st.sims.map((x) => ({ ...x, result: { summary: {} } as never })).map((x) => asFlown(st, x)),
    }));

    s().setMountMotor(
      configOf(
        s().configs,
        s().sims.find((x) => x.id === first)!,
      ).id,
      mount,
      {
        ...C6,
        designation: 'D12',
      },
    );

    const byId = (id: string) => s().sims.find((x) => x.id === id)!;
    expect(isStale(byId(first))).toBe(true);
    expect(isStale(byId(second))).toBe(false);
  });

  it('a duplicate flies the same configuration', () => {
    const mount = s().selectedId!;
    s().setMountMotor(config().id, mount, { ...C6, designation: 'D12' });
    const src = s().activeId;
    s().duplicateSim(src);
    expect(s().activeId).not.toBe(src);
    expect(selectActive(s()).configId).toBe(s().sims.find((x) => x.id === src)!.configId);
    expect(config().motors[mount]!.spec.designation).toBe('D12');
  });

  it('a new simulation joins an existing configuration rather than cloning it', () => {
    const before = s().configs.length;
    s().addSim();
    expect(s().configs).toHaveLength(before);
  });
});

describe('managing configurations', () => {
  beforeEach(() => {
    s().resetWorkspace();
  });

  it('adds one even when an identical loadout is already there', () => {
    s().addConfig();
    expect(s().configs).toHaveLength(2);
    expect(s().selectedConfigId).toBe(s().configs[1]!.id);
  });

  it('copies a configuration next to the one it came from', () => {
    const mount = mountId();
    s().setMountMotor(config().id, mount, { ...C6, designation: 'D12' });
    s().copyConfig(config().id);
    expect(s().configs).toHaveLength(2);
    expect(s().configs[1]!.motors[mount]!.spec.designation).toBe('D12');
    expect(s().configs[1]!.id).not.toBe(s().configs[0]!.id);
    expect(s().selectedConfigId).toBe(s().configs[1]!.id);
  });

  it('copies the deployment, separation and grounded overrides with the motors', () => {
    const src = config();
    useWorkspaceStore.setState({
      configs: [
        {
          ...src,
          deployments: { chute: { deployAltitude: 150 } },
          separations: { booster: { separationDelay: 1 } },
          grounded: ['booster'],
        },
      ],
    });
    s().copyConfig(src.id);
    const copy = s().configs[1]!;
    expect(copy.deployments).toEqual({ chute: { deployAltitude: 150 } });
    expect(copy.separations).toEqual({ booster: { separationDelay: 1 } });
    expect(copy.grounded).toEqual(['booster']);
    expect(copy.grounded).not.toBe(s().configs[0]!.grounded);
    expect(copy.deployments).not.toBe(s().configs[0]!.deployments);
  });

  it('names a copy after a NAMED source, and leaves an unnamed one unnamed', () => {
    s().copyConfig(config().id);
    expect(s().configs[1]!.name).toBeNull();
    s().renameConfig(s().configs[0]!.id, 'Contest');
    s().copyConfig(s().configs[0]!.id);
    expect(s().configs[1]!.name).toContain('Contest');
  });

  it('treats an empty name as unnamed rather than as a blank', () => {
    s().renameConfig(config().id, 'Contest');
    expect(config().name).toBe('Contest');
    s().renameConfig(config().id, '   ');
    s().commitConfigName(config().id);
    expect(config().name).toBeNull();
  });

  it('keeps a typed name as typed until the edit commits, then trims it', () => {
    s().renameConfig(config().id, 'Two ');
    expect(config().name).toBe('Two ');
    s().renameConfig(config().id, '  Two stage ');
    s().commitConfigName(config().id);
    expect(config().name).toBe('Two stage');
  });

  it('records no undo step for a name keystroke that changes nothing', () => {
    s().renameConfig(config().id, 'Contest');
    s().commitConfigName(config().id);
    const steps = s().past.length;
    s().renameConfig(config().id, 'Contest');
    s().commitConfigName(config().id);
    expect(s().past.length).toBe(steps);
  });

  it('refuses to delete the only configuration', () => {
    s().deleteConfig(config().id);
    expect(s().configs).toHaveLength(1);
  });

  it('moves the rows that flew a deleted configuration, and ages them', () => {
    const doomed = config().id;
    s().addConfig();
    const keep = s().selectedConfigId!;
    s().setMountMotor(keep, mountId(), { ...C6, designation: 'D12' });
    useWorkspaceStore.setState((st) => ({
      sims: st.sims.map((x) => ({ ...x, result: { summary: {} } as never })).map((x) => asFlown(st, x)),
    }));

    s().deleteConfig(doomed);

    expect(s().configs).toHaveLength(1);
    expect(s().sims.every((x) => x.configId === keep)).toBe(true);
    expect(s().sims.every((x) => isStale(x))).toBe(true);
  });

  it('points one row at another configuration, aging only that row', () => {
    s().addSim();
    const second = s().activeId;
    s().addConfig();
    const other = s().selectedConfigId!;
    s().setMountMotor(other, mountId(), { ...C6, designation: 'D12' });
    useWorkspaceStore.setState((st) => ({
      sims: st.sims.map((x) => ({ ...x, result: { summary: {} } as never })).map((x) => asFlown(st, x)),
    }));

    s().setSimConfig(second, other);

    const byId = (id: string) => s().sims.find((x) => x.id === id)!;
    expect(byId(second).configId).toBe(other);
    expect(isStale(byId(second))).toBe(true);
    expect(
      s()
        .sims.filter((x) => x.id !== second)
        .every((x) => !isStale(x)),
    ).toBe(true);
  });

  it('undoes an added configuration', () => {
    s().addConfig();
    expect(s().configs).toHaveLength(2);
    s().undo();
    expect(s().configs).toHaveLength(1);
  });
});

describe('per-configuration recovery', () => {
  beforeEach(() => {
    s().resetWorkspace();
  });

  const chuteId = () => findRecoveryDevices(s().tree)[0]!.id as string;

  it('overrides one field and leaves the rest to the design', () => {
    s().setDeployment(config().id, chuteId(), 'deployAltitude', 150);
    expect(config().deployments![chuteId()]).toEqual({ deployAltitude: 150 });
  });

  it('clears a field back to the design, and the map with it', () => {
    s().setDeployment(config().id, chuteId(), 'deployAltitude', 150);
    s().setDeployment(config().id, chuteId(), 'deployAltitude', null);
    expect(config().deployments).toBeUndefined();
  });

  it('ages every flight flown on the configuration that changed', () => {
    s().addSim();
    useWorkspaceStore.setState((st) => ({
      sims: st.sims.map((x) => ({ ...x, result: { summary: {} } as never })).map((x) => asFlown(st, x)),
    }));
    s().setDeployment(config().id, chuteId(), 'deployEvent', 'altitude');
    expect(s().sims.every((x) => isStale(x))).toBe(true);
  });

  it('is undone in one step, like any other edit', () => {
    s().setDeployment(config().id, chuteId(), 'deployDelay', 2);
    s().commitEdit();
    s().undo();
    expect(config().deployments).toBeUndefined();
  });
});

describe('per-configuration staging', () => {
  beforeEach(() => {
    s().resetWorkspace();
    s().addStageToTree();
  });

  const boosterId = () => findSeparators(s().tree)[0]!.id as string;

  it('overrides one field and leaves the rest to the design', () => {
    s().setSeparation(config().id, boosterId(), 'separationDelay', 2);
    expect(config().separations![boosterId()]).toEqual({ separationDelay: 2 });
  });

  it('clears a field back to the design, and the map with it', () => {
    s().setSeparation(config().id, boosterId(), 'separationDelay', 2);
    s().setSeparation(config().id, boosterId(), 'separationDelay', null);
    expect(config().separations).toBeUndefined();
  });

  it('ages every flight flown on the configuration that changed', () => {
    s().addSim();
    useWorkspaceStore.setState((st) => ({
      sims: st.sims.map((x) => ({ ...x, result: { summary: {} } as never })).map((x) => asFlown(st, x)),
    }));
    s().setSeparation(config().id, boosterId(), 'separationEvent', 'burnout');
    expect(s().sims.every((x) => isStale(x))).toBe(true);
  });

  it('drops the override when its booster is deleted', () => {
    const booster = boosterId();
    s().setSeparation(config().id, booster, 'separationDelay', 2);
    s().setSelectedId(booster);
    s().removeSelected();
    expect(config().separations?.[booster]).toBeUndefined();
  });
});

describe('per-configuration stage activeness', () => {
  beforeEach(() => {
    s().resetWorkspace();
    s().addStageToTree();
  });

  const stageIds = () => findStages(s().tree).map((n) => n.id as string);

  it('grounds a stage for this configuration alone', () => {
    const [, booster] = stageIds();
    s().addConfig();
    const other = s().selectedConfigId!;
    s().setStageFlies(other, booster!, false);
    expect(s().configs.find((c) => c.id === other)!.grounded).toEqual([booster]);
    expect(s().configs.find((c) => c.id !== other)!.grounded).toBeUndefined();
  });

  it('puts it back, and drops the list when nothing is grounded', () => {
    const [, booster] = stageIds();
    const id = config().id;
    s().setStageFlies(id, booster!, false);
    s().setStageFlies(id, booster!, true);
    expect(config().grounded).toBeUndefined();
  });

  it('keeps the list in TREE order however it was clicked', () => {
    const [sustainer, booster] = stageIds();
    const id = config().id;
    s().setStageFlies(id, booster!, false);
    s().setStageFlies(id, sustainer!, false);
    expect(config().grounded).toEqual([booster]);
  });

  it('refuses to ground the last stage still flying', () => {
    const [sustainer, booster] = stageIds();
    const id = config().id;
    s().setStageFlies(id, booster!, false);
    s().setStageFlies(id, sustainer!, false);
    expect(config().grounded).toEqual([booster]);
  });

  it('records no undo step when it changes nothing', () => {
    const [sustainer, booster] = stageIds();
    const id = config().id;
    s().setStageFlies(id, booster!, false);
    const depth = s().past.length;
    s().setStageFlies(id, sustainer!, false);
    s().setStageFlies(id, booster!, false);
    s().setStageFlies(id, sustainer!, true);
    expect(s().past.length).toBe(depth);
  });

  it('ages every flight flown on the configuration that changed', () => {
    const [, booster] = stageIds();
    useWorkspaceStore.setState((st) => ({
      sims: st.sims.map((x) => ({ ...x, result: { summary: {} } as never })).map((x) => asFlown(st, x)),
    }));
    s().setStageFlies(config().id, booster!, false);
    expect(s().sims.every((x) => isStale(x))).toBe(true);
  });
});

describe('simulation run guards', () => {
  beforeEach(() => {
    s().resetWorkspace();
  });

  it('hasThrustCurve distinguishes a real motor from an empty one', () => {
    expect(hasThrustCurve(C6)).toBe(true);
    expect(hasThrustCurve(null)).toBe(false);
    expect(hasThrustCurve({ ...C6, thrusts: [] })).toBe(false);
  });

  it('records a failed run against the design it failed on', async () => {
    simulateMock.mockRejectedValueOnce(new Error('kernel exploded'));
    await s().runSim();

    expect(s().err).toBe('"Simulation 1" failed: kernel exploded');
    expect(s().simBusy).toBe(false);
    expect(selectRunFailed(s())).toBe(true);
  });

  it('lets the retry happen again once the design changes', async () => {
    simulateMock.mockRejectedValueOnce(new Error('kernel exploded'));
    await s().runSim();
    expect(selectRunFailed(s())).toBe(true);

    s().setSelectedId('nose');
    s().patchSelected({ length: 0.2 });
    expect(selectRunFailed(s())).toBe(false);
  });

  it('drops a result the design has moved past', async () => {
    let release!: (r: unknown) => void;
    simulateMock.mockImplementationOnce(() => new Promise((res) => (release = res)));

    const running = s().runSim();
    s().setSelectedId('nose');
    s().patchSelected({ length: 0.3 });

    release({ summary: { apogee: 123 }, branches: [] });
    await running;

    expect(active().result).toBeNull();
    expect(s().view).not.toBe('flight');
  });

  it('refuses to run with no motor mount and reports why', async () => {
    s().setSelectedId('mount');
    s().removeSelected();
    expect(findMounts(s().tree)).toHaveLength(0);
    await s().runSim();
    expect(s().err).toBeTruthy();
    expect(s().simBusy).toBe(false);
    expect(active().result).toBeNull();
  });

  it('records a blocked design as a failed run, until the design changes', async () => {
    s().setSelectedId('mount');
    s().removeSelected();
    await s().runSim();
    expect(simulateMock).not.toHaveBeenCalled();
    expect(selectRunFailed(s())).toBe(true);

    s().setSelectedId('nose');
    s().patchSelected({ length: 0.2 });
    expect(selectRunFailed(s())).toBe(false);
  });
});

describe('results age instead of being destroyed', () => {
  const seed = (): void => {
    useWorkspaceStore.setState((st) => ({
      sims: st.sims.map((x) => asFlown(st, { ...x, result: { summary: { maxAltitude: 271 } } as never })),
    }));
  };
  beforeEach(() => {
    s().resetWorkspace();
    seed();
  });

  it('flags every simulation when the design changes', () => {
    const id = s().tree.components[0]!.id as string;
    s().setSelectedId(id);
    s().patchSelected({ length: 0.2 });
    expect(active().result).not.toBeNull();
    expect(s().sims.every((x) => isStale(x))).toBe(true);
  });

  it('flags nothing when only a part name changes', () => {
    s().setSelectedId(s().tree.components[0]!.id as string);
    s().patchSelected({ name: 'Ogive' });
    expect(s().sims.every((x) => !isStale(x))).toBe(true);
  });

  it('flags the active simulation when its own inputs change', () => {
    s().patchLaunch({ windAverage: 4 });
    expect(active().result).not.toBeNull();
    expect(isStale(active())).toBe(true);
  });

  it('flags the rows flying the configuration whose motor changed, and no other', () => {
    const first = s().activeId;
    s().addSim();
    const second = s().activeId;
    s().addConfig();
    s().setSimConfig(second, s().selectedConfigId!);
    seed();
    const row = (id: string) => s().sims.find((x) => x.id === id)!;
    s().setMountMotor(configOf(s().configs, row(first)).id, mountId(), { ...C6, designation: 'D12' });
    expect(isStale(row(first))).toBe(true);
    expect(row(second).result).not.toBeNull();
    expect(isStale(row(second))).toBe(false);
  });

  it('a finished run is current again', async () => {
    s().patchLaunch({ windAverage: 4 });
    expect(isStale(active())).toBe(true);
    simulateMock.mockResolvedValueOnce({ summary: { maxAltitude: 300 } } as unknown as FlightResult);
    await s().runSim();
    expect(isStale(active())).toBe(false);
  });

  it('carries results through an undo rather than blanking them', () => {
    const id = s().tree.components[0]!.id as string;
    s().setSelectedId(id);
    s().patchSelected({ length: 0.2 });
    s().commitEdit();
    s().undo();

    expect(active().result).not.toBeNull();
    expect(isStale(active())).toBe(false);
  });

  it('reads outdated after an undo that lands on inputs it was not flown from', () => {
    const id = s().tree.components[0]!.id as string;
    s().setSelectedId(id);
    s().patchSelected({ length: 0.2 });
    s().commitEdit();
    seed();
    s().undo();
    expect(active().result).not.toBeNull();
    expect(isStale(active())).toBe(true);
  });
});

describe('per-simulation options', () => {
  beforeEach(() => s().resetWorkspace());

  it('overrides the global value, and clears back to it', () => {
    s().setSimPref('timeStep', 0.01);
    expect(active().prefs?.timeStep).toBe(0.01);

    s().setSimPref('timeStep', null);
    // Removed, not undefined: `prefs` is spread over the globals and undefined would shadow them.
    expect(active().prefs).toBeUndefined();
  });

  it('wins over the global preference on a run', async () => {
    s().setSimPref('timeStep', 0.01);
    simulateMock.mockResolvedValueOnce({ summary: {} } as unknown as FlightResult);
    s().setSimPrefs({ ...s().simPrefs, timeStep: 0.05, maxTime: 1200, randomSeed: null });
    await s().runSim();

    expect(simulateMock.mock.calls[0]![0].options.timeStep).toBe(0.01);
    expect(simulateMock.mock.calls[0]![0].options.maxTime).toBe(1200);
  });
});

describe('running a selection', () => {
  beforeEach(() => {
    s().resetWorkspace();
    simulateMock.mockReset();
    simulateMock.mockResolvedValue({ summary: {} } as unknown as FlightResult);
  });

  it('defaults to the active simulation when nothing is ticked', () => {
    s().addSim();
    expect(s().selectedSimIds).toEqual([]);
    expect(selectRunIds(s())).toEqual([s().activeId]);
  });

  it('flies every ticked row, in order', async () => {
    s().addSim();
    const ids = s().sims.map((x) => x.id);
    s().setSimsSelected(ids);
    expect(selectRunIds(s())).toEqual(ids);

    await s().runSims(selectRunIds(s()));

    expect(simulateMock).toHaveBeenCalledTimes(2);
    expect(s().sims.every((x) => !!x.result)).toBe(true);
  });

  it('flies each row with ITS OWN configuration, not the active one', async () => {
    s().addSim();
    const [first, second] = s().sims;
    s().renameSim(first!.id, 'First');
    s().setSimsSelected([first!.id, second!.id]);

    await s().runSims(selectRunIds(s()));

    const launches = simulateMock.mock.calls.map((c) => c[0].options.launchRodLength);
    expect(launches).toHaveLength(2);
  });

  it('shows the run, one flight or a batch', async () => {
    await s().runSims([s().activeId]);
    expect(s().tab).toBe('results');
    expect(s().view).toBe('flight');

    s().setTab('design');
    s().addSim();
    s().setSimsSelected(s().sims.map((x) => x.id));
    await s().runSims(selectRunIds(s()));
    expect(s().tab).toBe('results');
  });

  it('records the simulations THIS run flew, and points the results at them', async () => {
    await s().runSims([s().activeId]);
    expect(s().lastRunIds).toEqual([s().activeId]);
    expect(s().resultSimId).toBe(s().activeId);

    s().addSim();
    const both = s().sims.map((x) => x.id);
    await s().runSims(both);
    expect(s().lastRunIds).toEqual(both);

    await s().runSims([both[0]!]);
    expect(s().lastRunIds).toEqual([both[0]]);
  });

  it('drops a deleted simulation from the last run', async () => {
    s().addSim();
    const both = s().sims.map((x) => x.id);
    await s().runSims(both);
    s().deleteSim(both[1]!);
    expect(s().lastRunIds).toEqual([both[0]]);
  });

  it('carries on past a simulation that cannot fly', async () => {
    s().addSim();
    const [first, second] = s().sims;
    seatMotor(first!.name, CURVELESS);

    await s().runSims([first!.id, second!.id]);

    expect(simulateMock).toHaveBeenCalledTimes(1);
    expect(s().sims.find((x) => x.id === second!.id)!.result).not.toBeNull();
    expect(s().err).toBeTruthy();
  });

  it('forgets a tick when its simulation is deleted', () => {
    s().addSim();
    const ids = s().sims.map((x) => x.id);
    s().setSimsSelected(ids);
    s().deleteSim(ids[0]!);
    expect(s().selectedSimIds).toEqual([ids[1]]);
  });

  it('toggles one row without moving the editor', () => {
    s().addSim();
    const other = s().sims[0]!.id;
    const active = s().activeId;
    s().toggleSimSelected(other);
    expect(s().selectedSimIds).toEqual([other]);
    expect(s().activeId).toBe(active);
    s().toggleSimSelected(other);
    expect(s().selectedSimIds).toEqual([]);
  });
});

describe('tab and view stay in step', () => {
  beforeEach(() => s().resetWorkspace());

  it('sends a flight view to the Results tab and a design view back to Design', () => {
    s().setDesignPane('sketch');
    s().setView('flight');
    expect(s().tab).toBe('results');
    s().setView('path');
    expect(s().tab).toBe('results');

    s().setView('2d');
    expect([s().tab, s().designPane]).toEqual(['design', 'sketch']);
    s().setView('drag');
    expect([s().tab, s().designPane]).toEqual(['design', 'sketch']);
  });

  it('leaves a caller alone on a pane that shows no view at all', () => {
    s().setDesignPane('stats');
    s().setView('flight');
    expect([s().tab, s().designPane]).toEqual(['design', 'stats']);
    s().setTab('sim');
    s().setView('2d');
    expect(s().tab).toBe('sim');
  });

  it('never strands you on Results with no result', () => {
    s().setView('flight');
    s().setTab('results');
    expect(s().tab).toBe('results');

    s().resetWorkspace();
    expect(s().view).toBe('2d');
    expect(s().tab).not.toBe('results');
  });

  it('pulls the view into whichever family the chosen tab shows', () => {
    s().setView('2d');
    s().setTab('results');
    expect(s().view).toBe('flight');

    s().setTab('design');
    expect(s().view).toBe('2d');
  });

  it('keeps the view you already had when it suits the tab', () => {
    s().setView('path');
    s().setTab('results');
    expect(s().view).toBe('path');

    s().setView('drag');
    s().setTab('design');
    expect(s().view).toBe('drag');
  });

  it('leaves the view alone for the places that do not own one', () => {
    s().setView('drag');
    s().setDesignPane('stats');
    expect([s().tab, s().designPane, s().view]).toEqual(['design', 'stats', 'drag']);
    s().setTab('sim');
    expect([s().tab, s().view]).toEqual(['sim', 'drag']);
  });

  it('treats the design pane as a phone detail, not a tab', () => {
    s().setView('drag');
    s().setDesignPane('stats');
    s().setDesignPane('sketch');
    expect([s().tab, s().view]).toEqual(['design', 'drag']);

    s().setTab('results');
    expect(s().view).toBe('flight');
    s().setDesignPane('stats');
    expect([s().tab, s().designPane, s().view]).toEqual(['design', 'stats', '2d']);
  });
});

describe('storage warning', () => {
  beforeEach(() => {
    s().resetWorkspace();
    s().setStorageWarning(null);
    s().setErr(null);
  });

  it('survives the rebuild effect clearing the transient error', () => {
    s().setStorageWarning('storage is full');
    s().setErr('something else went wrong');

    s().setErr(null);

    expect(s().err).toBeNull();
    expect(s().storageWarning).toBe('storage is full');
  });

  it('is cleared only by its own setter', () => {
    s().setStorageWarning('storage is degraded');
    expect(s().storageWarning).toBe('storage is degraded');
    s().setStorageWarning(null);
    expect(s().storageWarning).toBeNull();
  });
});

describe('openDesign is race-safe', () => {
  it('ignores a slow request that the user has already superseded', async () => {
    const wsFor = (name: string) => ({
      version: 3 as const,
      tree: { name, components: [] },
      sims: [{ id: 's1', name: 'Sim 1', configId: 'c1', result: null }],
      configs: [{ id: 'c1', name: null, motors: {} }],
      activeId: 's1',
      loadedMeta: null,
    });

    let releaseA!: () => void;
    const slowA = new Promise<void>((r) => (releaseA = r));
    const active: string[] = [];

    setDesignLibrary({
      list: async () => [],
      activeId: async () => null,
      read: async (id: string) => {
        if (id === 'A') await slowA;
        return wsFor(id) as never;
      },
      readResults: async () => ({}),
      write: async () => true,
      writeIfUnchanged: async () => ({ status: 'ok', updatedAt: 1 }),
      create: async () => ({ id: 'X', name: 'X', updatedAt: 0 }),
      rename: async () => true,
      remove: async () => true,
      setActive: async (id: string) => {
        active.push(id);
        return true;
      },
    } as never);

    const pA = s().openDesign('A');
    await s().openDesign('B');
    releaseA();
    await pA;

    expect((s().tree as unknown as { name: string }).name).toBe('B');
    expect(active).toEqual(['B']);
  });
});

describe('replacing the workspace is race-safe across actions, not just openDesign', () => {
  const orkFile = (name: string, hold?: Promise<void>): File =>
    ({
      name: `${name}.ork`,
      arrayBuffer: async () => {
        if (hold) await hold;
        return new TextEncoder().encode(name).buffer;
      },
    }) as unknown as File;

  beforeEach(() => {
    s().resetWorkspace();
    vi.doUnmock('../../src/services/files/loadOrk');
  });

  it('a slow import does not overwrite the fast one the user opened after it', async () => {
    let releaseSlow!: () => void;
    const slow = new Promise<void>((r) => (releaseSlow = r));
    vi.doMock('../../src/services/files/loadOrk', () => ({
      loadOrk: async (bytes: ArrayBuffer) => ({
        name: new TextDecoder().decode(bytes),
        notes: [],
        tree: { name: new TextDecoder().decode(bytes), components: [] },
        motors: {},
        configs: [{ id: 'cfg-1', name: null, motors: {} }],
        chosenConfigId: 'cfg-1',
      }),
    }));

    const big = s().openOrkFile(orkFile('BIG', slow));
    await s().openOrkFile(orkFile('SMALL'));
    releaseSlow();
    await big;

    expect((s().tree as unknown as { name: string }).name).toBe('SMALL');
  });

  it("warns on open about any of the file's simulations launched outside the codes", async () => {
    vi.doMock('../../src/services/files/loadOrk', () => ({
      loadOrk: async () => ({
        name: 'TWO',
        notes: [],
        tree: { name: 'TWO', components: [] },
        motors: {},
        configs: [{ id: 'cfg-1', name: null, motors: {} }],
        chosenConfigId: 'cfg-1',
        simulations: [
          { name: 'Calm', configId: 'cfg-1', launch: { launchRodAngleDeg: 5 } },
          { name: 'Tilted', configId: 'cfg-1', launch: { launchRodAngleDeg: 45 } },
        ],
      }),
    }));
    await s().openOrkFile(orkFile('TWO'));
    expect(s().sims.map((x) => x.name)).toEqual(['Calm', 'Tilted']);
    const notes = s().loadedMeta?.notes ?? [];
    expect(notes.some((n) => typeof n !== 'string' && /45/.test(JSON.stringify(n.values)))).toBe(true);
  });

  it('a superseded import does not post its error over the design that replaced it', async () => {
    let releaseSlow!: () => void;
    const slow = new Promise<void>((r) => (releaseSlow = r));
    vi.doMock('../../src/services/files/loadOrk', () => ({
      loadOrk: async (bytes: ArrayBuffer) => {
        if (new TextDecoder().decode(bytes) === 'BAD') throw new Error('corrupt zip');
        return {
          name: 'GOOD',
          notes: [],
          tree: { name: 'GOOD', components: [] },
          motors: {},
          configs: [{ id: 'cfg-1', name: null, motors: {} }],
          chosenConfigId: 'cfg-1',
        };
      },
    }));

    const bad = s().openOrkFile(orkFile('BAD', slow));
    await s().openOrkFile(orkFile('GOOD'));
    releaseSlow();
    await bad;

    expect(s().err).toBeNull();
    expect((s().tree as unknown as { name: string }).name).toBe('GOOD');
  });

  it('starting a new design voids an import still in flight', async () => {
    let releaseSlow!: () => void;
    const slow = new Promise<void>((r) => (releaseSlow = r));
    vi.doMock('../../src/services/files/loadOrk', () => ({
      loadOrk: async () => ({
        name: 'IMPORTED',
        notes: [],
        tree: { name: 'IMPORTED', components: [] },
        motors: {},
        motorSpecs: {},
      }),
    }));

    const pending = s().openOrkFile(orkFile('IMPORTED', slow));
    s().resetWorkspace();
    releaseSlow();
    await pending;

    expect((s().tree as unknown as { name?: string }).name).not.toBe('IMPORTED');
  });
});

describe('openOrkFile refuses an oversized file before reading it', () => {
  it('posts the size error without loading the bytes', async () => {
    s().resetWorkspace();
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    // 4 GiB
    const huge = { name: 'huge.ork', size: 2 ** 32, arrayBuffer } as unknown as File;

    await s().openOrkFile(huge);

    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(s().err).toMatch(/too large/);
  });
});

describe('openDesign honors a refused setActive', () => {
  beforeEach(() => s().resetWorkspace());

  it('does not switch the workspace, and raises the banner', async () => {
    const before = s().tree;
    setDesignLibrary({
      list: async () => [{ id: 'b', name: 'B', updatedAt: 0 }],
      activeId: async () => 'a',
      read: async () => ({
        version: 3,
        tree: { name: 'B-TREE', components: [] },
        sims: [{ ...s().sims[0]!, name: 'B sim' }],
        configs: s().configs,
        activeId: 'x',
        loadedMeta: null,
      }),
      write: async () => true,
      writeIfUnchanged: async () => ({ status: 'ok', updatedAt: 1 }),
      create: async () => ({ id: 'n', name: 'n', updatedAt: 0 }),
      rename: async () => true,
      remove: async () => true,
      setActive: async () => false,
    } as never);
    await s().openDesign('b');
    expect(s().tree).toBe(before);
    expect((s().storageNotices.save ?? s().storageNotices.standing)?.kind).toBe('full');
  });

  it('rejects a blob whose tree.components is not an array, like the boot path does', async () => {
    const before = s().tree;
    setDesignLibrary({
      list: async () => [],
      activeId: async () => null,
      read: async () => ({
        version: 3,
        tree: { components: 'nope' },
        sims: [{ id: 's1', configId: 'c1' }],
        configs: [{ id: 'c1', motors: {} }],
        activeId: 'x',
        loadedMeta: null,
      }),
      write: async () => true,
      writeIfUnchanged: async () => ({ status: 'ok', updatedAt: 1 }),
      create: async () => ({ id: 'n', name: 'n', updatedAt: 0 }),
      rename: async () => true,
      remove: async () => true,
      setActive: async () => true,
    } as never);
    await s().openDesign('corrupt');
    expect(s().tree).toBe(before);
    expect(s().err).toBeTruthy();
  });
});

describe('the safety codes stop a run', () => {
  beforeEach(() => {
    s().resetWorkspace();
    simulateMock.mockReset();
    simulateMock.mockResolvedValue({ summary: {} } as unknown as FlightResult);
  });

  it('refuses a simulation whose rod angle is outside the code', async () => {
    s().patchLaunch({ launchRodAngleDeg: 35 });
    await s().runSim();

    expect(simulateMock).not.toHaveBeenCalled();
    expect(s().err).toContain('35');
    expect(active().result).toBeNull();
    expect(s().simBusy).toBe(false);
  });

  it('refuses a simulation whose wind is outside the code', async () => {
    s().patchLaunch({ windAverage: 20 }); // 20 m/s is about 45 mph
    await s().runSim();
    expect(simulateMock).not.toHaveBeenCalled();
    expect(s().err).toBeTruthy();
  });

  it('skips only the offending row of a batch', async () => {
    s().addSim();
    const [first, second] = s().sims;
    useWorkspaceStore.setState((st) => ({
      sims: st.sims.map((x) => (x.id === first!.id ? { ...x, launch: { ...x.launch, launchRodAngleDeg: 35 } } : x)),
    }));

    await s().runSims([first!.id, second!.id]);

    expect(simulateMock).toHaveBeenCalledTimes(1);
    expect(s().sims.find((x) => x.id === second!.id)!.result).not.toBeNull();
    expect(s().sims.find((x) => x.id === first!.id)!.result).toBeNull();
    expect(s().err).toBeTruthy();
  });

  it('runs once the conditions are brought back inside', async () => {
    s().patchLaunch({ launchRodAngleDeg: 35 });
    await s().runSim();
    expect(simulateMock).not.toHaveBeenCalled();

    s().patchLaunch({ launchRodAngleDeg: 10 });
    await s().runSim();
    expect(simulateMock).toHaveBeenCalledTimes(1);
  });
});

describe('what reaches storage', () => {
  it('hands the flight results over rather than dropping them', async () => {
    s().resetWorkspace();
    useWorkspaceStore.setState((st) => ({
      sims: st.sims.map((x) => ({ ...x, result: { summary: { maxAltitude: 271 } } as never })),
    }));

    const save = vi.spyOn(getWorkspaceStore(), 'save').mockResolvedValue(undefined);
    setDesignLibrary({
      list: async () => [],
      activeId: async () => 'D',
      read: async () =>
        ({
          version: 3,
          tree: { components: [] },
          sims: [{ id: 's1', name: 'Sim 1', configId: 'c1', result: null }],
          configs: [{ id: 'c1', name: null, motors: {} }],
          activeId: 's1',
          loadedMeta: null,
        }) as never,
      write: async () => true,
      writeIfUnchanged: async () => ({ status: 'ok', updatedAt: 1 }),
      readResults: async () => ({}),
      writeResults: async () => true,
      create: async () => ({ id: 'D', name: 'D', updatedAt: 0 }),
      rename: async () => true,
      remove: async () => true,
      setActive: async () => true,
    } as never);

    await s().openDesign('D');

    expect(save).toHaveBeenCalled();
    const written = JSON.stringify(save.mock.calls[0]![0]);
    expect(written).toContain('maxAltitude');
    expect(written).toContain('launch');
    save.mockRestore();
  });
});

describe('replacing the workspace resets the transient run state', () => {
  const dirty = () =>
    useWorkspaceStore.setState({
      simRuns: { ghost: { phase: 'queued' } as never },
      lastRunIds: ['ghost'],
      resultSimId: 'ghost',
      selectedSimIds: ['ghost'],
      simBusy: true,
      err: 'left over from the previous design',
    });
  const clean = () => {
    expect(s().simRuns).toEqual({});
    expect(s().lastRunIds).toEqual([]);
    expect(s().resultSimId).toBeNull();
    expect(s().selectedSimIds).toEqual([]);
    expect(s().simBusy).toBe(false);
    expect(s().err).toBeNull();
  };

  it('resetWorkspace clears all of it, including err', () => {
    dirty();
    s().resetWorkspace();
    clean();
    expect(s().activeDesignId).toBeNull();
  });

  it('hydrate clears all of it', () => {
    s().resetWorkspace();
    const snapshot = { tree: s().tree, sims: s().sims, activeId: s().activeId, loadedMeta: null };
    dirty();
    s().hydrate(snapshot as never);
    clean();
    expect(s().activeId).toBe(snapshot.activeId);
  });

  it('hydrate resolves a transition end with no radius, and keeps a current result current', () => {
    s().resetWorkspace();
    const tree = {
      name: 'Bare',
      components: [
        {
          type: 'stage',
          id: 'st',
          name: 'S',
          children: [
            { type: 'bodytube', id: 'fore', length: 0.2, outerRadius: 0.03, thickness: 0.001 },
            { type: 'transition', id: 'tr', length: 0.05, thickness: 0.001, shape: 'conical' },
            { type: 'bodytube', id: 'aft', length: 0.2, outerRadius: 0.02, thickness: 0.001 },
          ],
        },
      ],
    };
    const configs = reconcileConfigs(tree as never, s().configs);
    const sims = s().sims.map((x) =>
      asFlown({ ...s(), tree, configs } as never, { ...x, result: { summary: {} } as never }),
    );
    s().hydrate({ tree, sims, configs, activeId: s().activeId, loadedMeta: null } as never);
    const tr = s().tree.components[0]!.children!.find((c) => c.id === 'tr')!;
    expect(tr['foreRadius']).toBeCloseTo(0.03, 12);
    expect(tr['aftRadius']).toBeCloseTo(0.02, 12);
    expect(isStale(active())).toBe(false);
  });

  it('happens in ONE set: no subscriber sees the new design with the old run state', () => {
    dirty();
    const seen: { tree: unknown; err: string | null; simBusy: boolean }[] = [];
    const before = s().tree;
    const unsub = useWorkspaceStore.subscribe((st) => seen.push({ tree: st.tree, err: st.err, simBusy: st.simBusy }));
    s().resetWorkspace();
    unsub();
    for (const st of seen) if (st.tree !== before) expect([st.err, st.simBusy]).toEqual([null, false]);
    expect(seen.some((st) => st.tree !== before)).toBe(true);
  });
});

describe('importing a rocket whose name is already saved', () => {
  const orkFile = (name: string): File =>
    ({
      name: `${name}.ork`,
      arrayBuffer: async () => new TextEncoder().encode(name).buffer,
    }) as unknown as File;

  const mockLoadOrk = () =>
    vi.doMock('../../src/services/files/loadOrk', () => ({
      loadOrk: async (bytes: ArrayBuffer) => {
        const name = new TextDecoder().decode(bytes);
        return {
          name,
          notes: [],
          tree: { name, components: [] },
          motors: {},
          configs: [{ id: `cfg-${name}`, name: null, motors: {} }],
          chosenConfigId: `cfg-${name}`,
        };
      },
    }));

  const autoConfirm = (value: boolean) =>
    useConfirmStore.subscribe((st) => {
      if (st.request) useConfirmStore.getState().settle(value);
    });
  const autoPrompt = (value: string | null) =>
    usePromptStore.subscribe((st) => {
      if (st.request) usePromptStore.getState().settle(value);
    });

  const libWith = (names: string[], calls: { active: string[]; created: string[] }) =>
    ({
      list: async () => names.map((name, i) => ({ id: `d${i}`, name, updatedAt: i })),
      activeId: async () => null,
      read: async () => null,
      write: async () => true,
      writeIfUnchanged: async () => ({ status: 'ok', updatedAt: 1 }),
      writeResults: async () => true,
      readResults: async () => ({}),
      create: async (name: string) => {
        calls.created.push(name);
        return { id: 'fresh', name, updatedAt: 0 };
      },
      rename: async () => true,
      remove: async () => true,
      setActive: async (id: string) => {
        calls.active.push(id);
        return true;
      },
    }) as never;

  const autosave = () =>
    getWorkspaceStore().save({
      version: 3,
      tree: s().tree,
      sims: s().sims,
      configs: s().configs,
      activeId: s().activeId,
      loadedMeta: s().loadedMeta,
    });

  let stop: (() => void)[] = [];
  beforeEach(() => {
    s().resetWorkspace();
    getWorkspaceStore().setActiveId?.(null);
    mockLoadOrk();
  });
  afterEach(() => {
    stop.forEach((fn) => fn());
    stop = [];
    vi.doUnmock('../../src/services/files/loadOrk');
  });

  it('imports straight through when the name is free', async () => {
    const calls = { active: [], created: [] as string[] };
    setDesignLibrary(libWith(['Something else'], calls));
    stop.push(autoConfirm(true), autoPrompt('NOT ASKED'));

    const before = s().importSeq;
    await s().openOrkFile(orkFile('Big Bertha'));
    await autosave();

    expect(calls.created).toEqual(['Big Bertha']);
    expect(s().importSeq).toBe(before + 1);
  });

  it('overwrites the saved rocket when the user says so', async () => {
    const calls = { active: [] as string[], created: [] as string[] };
    setDesignLibrary(libWith(['Big Bertha'], calls));
    stop.push(autoConfirm(true));

    await s().openOrkFile(orkFile('Big Bertha'));
    await autosave();

    expect(calls.active).toEqual(['d0']);
    expect(s().activeDesignId).toBe('d0');
    expect(calls.created).toEqual([]);
  });

  it('creates it under the name the user typed instead', async () => {
    const calls = { active: [] as string[], created: [] as string[] };
    setDesignLibrary(libWith(['Big Bertha'], calls));
    stop.push(autoConfirm(false), autoPrompt('Big Bertha mk2'));

    await s().openOrkFile(orkFile('Big Bertha'));
    expect(s().activeDesignId).toBeNull();
    await autosave();

    expect(calls.created).toEqual(['Big Bertha mk2']);
    expect(calls.active).toEqual([]);
  });

  it('falls back to a suffixed name when the user cancels the name dialog', async () => {
    const calls = { active: [] as string[], created: [] as string[] };
    setDesignLibrary(libWith(['Big Bertha', 'Big Bertha (2)'], calls));
    stop.push(autoConfirm(false), autoPrompt(null));

    await s().openOrkFile(orkFile('Big Bertha'));
    await autosave();

    expect(calls.created).toEqual(['Big Bertha (3)']);
  });

  it('writes the outgoing design before the import replaces it', async () => {
    const calls = { active: [] as string[], created: [] as string[] };
    const written: Workspace[] = [];
    const lib = Object.assign(libWith(['Something else'], calls) as object, {
      create: async (name: string, w: Workspace) => {
        calls.created.push(name);
        written.push(w);
        return { id: 'fresh', name, updatedAt: 0 };
      },
    });
    setDesignLibrary(lib as never);
    stop.push(autoConfirm(true));
    s().addPartToTree('bodytube');
    const edited = s().tree;

    await s().openOrkFile(orkFile('Big Bertha'));

    expect(written).toHaveLength(1);
    expect(written[0]!.tree).toBe(edited);
    expect(s().tree.name).toBe('Big Bertha');
  });

  it('writes nothing for an untouched New before the import', async () => {
    const calls = { active: [] as string[], created: [] as string[] };
    setDesignLibrary(libWith(['Something else'], calls));
    stop.push(autoConfirm(true));

    await s().openOrkFile(orkFile('Big Bertha'));

    expect(calls.created).toEqual([]);
  });

  it('abandons the import rather than switching on a refused active-pointer write', async () => {
    const calls = { active: [] as string[], created: [] as string[] };
    const lib = Object.assign(libWith(['Big Bertha'], calls) as object, { setActive: async () => false });
    setDesignLibrary(lib as never);
    stop.push(autoConfirm(true));
    const before = s().tree;

    await s().openOrkFile(orkFile('Big Bertha'));

    expect(s().tree).toBe(before);
    expect((s().storageNotices.save ?? s().storageNotices.standing)?.kind).toBe('full');
  });
});

describe('a new fin fillet', () => {
  beforeEach(() => s().resetWorkspace());

  it('is epoxy, not Cardboard', () => {
    s().setSelectedId('fins');
    s().patchSelected({ filletRadius: 0.004 });
    s().commitEdit();
    const fin = findNode(s().tree, 'fins')!;
    expect(fin['filletMaterialName']).toBe('Epoxy - West System Six10');
    expect(fin['filletDensity']).toBe(1180);
  });
});

describe('replacing the workspace', () => {
  beforeEach(() => s().resetWorkspace());

  it('drops the previous design repair notes on New', () => {
    useWorkspaceStore.setState({ repairNotes: ['Nose cone: density clamped'] });
    s().resetWorkspace();
    expect(s().repairNotes).toEqual([]);
  });

  it('drops the configuration the tab had selected', () => {
    s().addConfig();
    expect(s().selectedConfigId).not.toBeNull();
    s().resetWorkspace();
    expect(s().selectedConfigId).toBeNull();
  });

  it('starts a loaded design with nothing to undo', () => {
    const stored = workspaceSnapshot(s());
    s().setSelectedId('nose');
    s().patchSelected({ length: 0.2 });
    s().commitEdit();
    expect(s().past.length).toBeGreaterThan(0);
    s().hydrate(stored);
    expect(s().past).toHaveLength(0);
    expect(s().future).toHaveLength(0);
  });
});

describe('the configuration the tab edits', () => {
  beforeEach(() => s().resetWorkspace());

  it('follows the active simulation when its selection is gone', () => {
    s().addConfig();
    const flown = s().selectedConfigId!;
    s().setSimConfig(s().activeId, flown);
    s().addConfig();
    s().undo();
    expect(s().configs.some((c) => c.id === s().selectedConfigId)).toBe(false);
    expect(selectEditedConfig(s()).id).toBe(flown);
  });
});

describe('an import that does not replace the design', () => {
  const orkFile = (name: string): File =>
    ({
      name: `${name}.ork`,
      arrayBuffer: async () => new TextEncoder().encode(name).buffer,
    }) as unknown as File;

  beforeEach(() => {
    s().resetWorkspace();
  });
  afterEach(() => {
    vi.doUnmock('../../src/services/files/loadOrk');
  });

  it('asks for a rebuild when the import fails', async () => {
    vi.doMock('../../src/services/files/loadOrk', () => ({
      loadOrk: async () => {
        throw new Error('corrupt zip');
      },
    }));
    const tree = s().tree;
    const before = s().rebuildSeq;
    await s().openOrkFile(orkFile('BAD'));
    expect(s().tree).toBe(tree);
    expect(s().rebuildSeq).toBe(before + 1);
  });

  it('asks for a rebuild when the import is abandoned', async () => {
    vi.doMock('../../src/services/files/loadOrk', () => ({
      loadOrk: async () => ({
        name: 'Taken',
        notes: [],
        tree: { name: 'Taken', components: [] },
        motors: {},
        configs: [{ id: 'cfg-1', name: null, motors: {} }],
        chosenConfigId: 'cfg-1',
      }),
    }));
    setDesignLibrary({
      list: async () => [{ id: 'd0', name: 'Taken', updatedAt: 0 }],
      activeId: async () => null,
      setActive: async () => false,
    } as never);
    const stop = useConfirmStore.subscribe((st) => {
      if (st.request) useConfirmStore.getState().settle(true);
    });
    try {
      const tree = s().tree;
      const before = s().rebuildSeq;
      await s().openOrkFile(orkFile('Taken'));
      expect(s().tree).toBe(tree);
      expect(s().rebuildSeq).toBe(before + 1);
    } finally {
      stop();
    }
  });

  it('does not ask for one when the import lands: the new design builds itself', async () => {
    vi.doMock('../../src/services/files/loadOrk', () => ({
      loadOrk: async () => ({
        name: 'Fresh',
        notes: [],
        tree: { name: 'Fresh', components: [] },
        motors: {},
        configs: [{ id: 'cfg-1', name: null, motors: {} }],
        chosenConfigId: 'cfg-1',
      }),
    }));
    setDesignLibrary({ list: async () => [], activeId: async () => null } as never);
    const before = s().rebuildSeq;
    await s().openOrkFile(orkFile('Fresh'));
    expect((s().tree as unknown as { name: string }).name).toBe('Fresh');
    expect(s().rebuildSeq).toBe(before);
  });
});
