import type { StateCreator } from 'zustand';
import i18n from '../i18n';
import type { MotorSpec, RocketTree, IgnitionEvent } from '../engine/openRocketEngine';
import { findNode, findStages, updateNode } from '../services/design/treeEdit';
import {
  configFor,
  liveMotors,
  type DeployOverride,
  type SepOverride,
  newFlightConfig,
  reconcileConfigs,
  mountIgnition,
  sameIgnition,
  type FlightConfig,
  type MountMotor,
} from '../services/flight/flightConfigs';
import { holdsKey, nonEmpty, withKey } from '../services/app/objectKeys';
import type { MotorDims } from '../tree/schematicGeometry';
import type { ConfigsTab } from './tabs';
import type { WorkspaceState } from './store';
import { defaultConfig, selectActive } from './workspaceSelectors';
import { insertAfter, replaceById, type EditSteps } from './sliceShared';

export type IgnitionScope = 'config' | 'all';

export interface ConfigSlice {
  /** Never empty: every simulation names the configuration it flies. */
  configs: FlightConfig[];
  /** Null follows the active simulation's. */
  selectedConfigId: string | null;
  configsTab: ConfigsTab;

  setSelectedConfigId: (id: string | null) => void;
  setConfigsTab: (tab: ConfigsTab) => void;
  setMountMotor: (configId: string, mountId: string, m: MotorSpec) => void;
  /** `all` matches desktop's IgnitionSelectionDialog "Change all configurations". */
  setMountIgnition: (
    configId: string,
    mountId: string,
    event: IgnitionEvent,
    delay: number,
    scope?: IgnitionScope,
  ) => void;
  /** Null clears the override. */
  setDeployment: <K extends keyof DeployOverride>(
    configId: string,
    deviceId: string,
    key: K,
    value: DeployOverride[K] | null,
  ) => void;
  /** Null clears the override. */
  setSeparation: <K extends keyof SepOverride>(
    configId: string,
    stageId: string,
    key: K,
    value: SepOverride[K] | null,
  ) => void;
  setStageFlies: (configId: string, stageId: string, flies: boolean) => void;
  addConfig: () => void;
  copyConfig: (id: string) => void;
  /** Untrimmed, so a controlled input can be typed into; `commitConfigName` tidies it. */
  renameConfig: (id: string, name: string) => void;
  commitConfigName: (id: string) => void;
  deleteConfig: (id: string) => void;
}

export const selectEditedConfig = (s: WorkspaceState): FlightConfig => {
  // A vanished selection follows the active simulation, not `configFor`'s first row.
  const picked = s.selectedConfigId ? s.configs.find((c) => c.id === s.selectedConfigId) : undefined;
  return picked ?? configFor(s.configs, selectActive(s).configId);
};

export function selectMotorDims(tree: RocketTree, config: FlightConfig): MotorDims {
  const m: MotorDims = {};
  for (const [id, mm] of liveMotors(tree, config)) {
    m[id] = { length: mm.spec.length, diameter: mm.spec.diameter, label: mm.spec.designation };
  }
  return m;
}

/** A curve-less motor is kept, never silently replaced. */
export function sanitizeConfigs(tree: RocketTree, configs: FlightConfig[]): FlightConfig[] {
  const safe = (Array.isArray(configs) ? configs : []).filter((c) => c && typeof c.id === 'string' && c.motors);
  return reconcileConfigs(tree, safe.length ? safe : [defaultConfig(tree)]);
}

/** A catalog pick builds a new object each time, so reference equality is not enough. */
function sameMotorSpec(a: MotorSpec, b: MotorSpec): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof MotorSpec)[]);
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length || x.some((v, i) => v !== y[i])) return false;
    } else if (x !== y) return false;
  }
  return true;
}

interface ConfigSliceShared extends EditSteps {
  seed: FlightConfig;
}

export const createConfigSlice =
  ({ seed, beginEdit, commitEdit, recordStep }: ConfigSliceShared): StateCreator<WorkspaceState, [], [], ConfigSlice> =>
  (set, get) => {
    const patchConfig = (configId: string, mutate: (c: FlightConfig) => FlightConfig) => {
      set((s) => {
        const current = s.configs.find((c) => c.id === configId);
        if (!current) return {};
        const edited = mutate(current);
        if (edited === current) return {};
        return { configs: replaceById(s.configs, configId, () => edited) };
      });
    };

    return {
      configs: [seed],
      selectedConfigId: null,
      configsTab: 'motors',

      setSelectedConfigId: (selectedConfigId) => set({ selectedConfigId }),
      setConfigsTab: (configsTab) => set({ configsTab }),
      setMountMotor: (configId, mountId, m) => {
        const current = get().configs.find((c) => c.id === configId);
        if (!current) return;
        const seated = current.motors[mountId];
        if (seated && sameMotorSpec(seated.spec, m)) return;
        recordStep();
        patchConfig(configId, (c) => ({ ...c, motors: { ...c.motors, [mountId]: { ...c.motors[mountId], spec: m } } }));
      },
      setMountIgnition: (configId, mountId, event, delay, scope = 'config') => {
        const target = { ignitionEvent: event, ignitionDelay: delay };
        const timed = (seated: MountMotor | undefined) => !!seated && sameIgnition(seated, target);
        if (scope === 'all') {
          // Desktop: MotorMount.getMotorIterator, plus the mount itself.
          const { tree, configs } = get();
          const mount = findNode(tree, mountId);
          const nodeMoves = !!mount && !sameIgnition(mountIgnition(mount), target);
          const next = configs.map((c) => {
            const seated = c.motors[mountId];
            if (!seated || timed(seated)) return c;
            return { ...c, motors: { ...c.motors, [mountId]: { ...seated, ...target } } };
          });
          if (!nodeMoves && next.every((c, i) => c === configs[i])) return;
          beginEdit();
          set({ tree: nodeMoves ? updateNode(tree, mountId, target) : tree, configs: next });
          return;
        }
        const seated = get().configs.find((c) => c.id === configId)?.motors[mountId];
        if (!seated || timed(seated)) return;
        beginEdit();
        patchConfig(configId, (c) => {
          const seated = c.motors[mountId];
          if (!seated) return c;
          return { ...c, motors: { ...c.motors, [mountId]: { ...seated, ...target } } };
        });
      },
      setDeployment: (configId, deviceId, key, value) => {
        // A new config object would read as a changed input and drop a run in flight.
        const config = get().configs.find((c) => c.id === configId);
        if (!config || holdsKey(config.deployments?.[deviceId], key, value)) return;
        beginEdit();
        patchConfig(configId, (c) => {
          // Removed, not stored as undefined: a key holding `undefined` still counts as an override.
          const device = nonEmpty(withKey(c.deployments?.[deviceId], key, value));
          return { ...c, deployments: nonEmpty(withKey(c.deployments, deviceId, device ?? null)) };
        });
      },
      setSeparation: (configId, stageId, key, value) => {
        const config = get().configs.find((c) => c.id === configId);
        if (!config || holdsKey(config.separations?.[stageId], key, value)) return;
        beginEdit();
        patchConfig(configId, (c) => {
          const stage = nonEmpty(withKey(c.separations?.[stageId], key, value));
          return { ...c, separations: nonEmpty(withKey(c.separations, stageId, stage ?? null)) };
        });
      },
      setStageFlies: (configId, stageId, flies) => {
        const s = get();
        const current = s.configs.find((c) => c.id === configId);
        if (!current) return;
        const stages = findStages(s.tree).map((n) => n.id as string);
        const grounded = new Set(current.grounded ?? []);
        if (flies) grounded.delete(stageId);
        else grounded.add(stageId);
        // The kernel refuses an empty rocket.
        if (stages.every((id) => grounded.has(id))) return;
        const next = stages.filter((id) => grounded.has(id)); // tree order, not click order
        const before = current.grounded ?? [];
        if (next.length === before.length && next.every((id, i) => id === before[i])) return;
        recordStep();
        patchConfig(configId, (c) => ({ ...c, ...(next.length ? { grounded: next } : { grounded: undefined }) }));
      },
      addConfig: () => {
        recordStep();
        const s = get();
        const made = defaultConfig(s.tree);
        set({ configs: [...s.configs, made], selectedConfigId: made.id });
      },
      copyConfig: (id) => {
        const s = get();
        const src = s.configs.find((c) => c.id === id);
        if (!src) return;
        recordStep();
        const copy: FlightConfig = newFlightConfig(
          { ...src.motors },
          src.name === null ? null : i18n.t('configs.copyName', { name: src.name }),
        );
        // Desktop's copyFlightConfiguration copies every override.
        if (src.deployments) copy.deployments = { ...src.deployments };
        if (src.separations) copy.separations = { ...src.separations };
        if (src.grounded) copy.grounded = [...src.grounded];
        set({ configs: insertAfter(s.configs, id, copy), selectedConfigId: copy.id });
      },
      renameConfig: (id, name) => {
        // Trimming here would eat the space before the next word is typed.
        const next = name === '' ? null : name;
        const current = get().configs.find((c) => c.id === id);
        if (!current || current.name === next) return;
        beginEdit();
        set((s) => ({ configs: replaceById(s.configs, id, (c) => ({ ...c, name: next })) }));
      },
      commitConfigName: (id) => {
        const current = get().configs.find((c) => c.id === id);
        const tidy = current?.name?.trim() || null;
        if (current && current.name !== tidy) {
          beginEdit();
          set((s) => ({ configs: replaceById(s.configs, id, (c) => ({ ...c, name: tidy })) }));
        }
        commitEdit();
      },
      deleteConfig: (id) => {
        const s = get();
        const rest = s.configs.filter((c) => c.id !== id);
        if (!rest.length) return;
        recordStep();
        const fallback = rest[0]!.id;
        set({
          configs: rest,
          sims: s.sims.map((x) => (x.configId === id ? { ...x, configId: fallback } : x)),
          selectedConfigId: s.selectedConfigId === id ? fallback : s.selectedConfigId,
        });
      },
    };
  };
