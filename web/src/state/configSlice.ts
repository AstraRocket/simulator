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

/** Which configurations an ignition change reaches; see `setMountIgnition`. */
export type IgnitionScope = 'config' | 'all';

/**
 * The flight configurations: the named motor loadouts each simulation flies,
 * with their recovery, separation and grounded-stage overrides, and the
 * Configurations tab's own selection.
 */
export interface ConfigSlice {
  /**
   * The flight configurations this design holds - the named motor loadouts each
   * simulation points at (services/flight/flightConfigs.ts).
   *
   * Never empty: a simulation names the configuration it flies, so there is
   * always one to name.
   */
  configs: FlightConfig[];
  /**
   * The configuration the Configurations tab is pointed at, or null to follow
   * the active simulation's.
   *
   * Transient, like `selectedId` on the design tree: which row you had
   * highlighted is not part of the design, and a stored one would outlive the
   * configuration it names.
   */
  selectedConfigId: string | null;
  /**
   * Which part of a configuration the tab is showing: its motors, when its
   * recovery devices open, or when its boosters separate.
   *
   * In the store rather than the pane, because the table and the editor beside
   * it are different components at lg+ (see App.tsx) and both follow it.
   */
  configsTab: ConfigsTab;

  /** Point the Configurations tab at one configuration; null follows the active simulation. */
  setSelectedConfigId: (id: string | null) => void;
  setConfigsTab: (tab: ConfigsTab) => void;
  /**
   * Seat a motor in one mount of one flight configuration.
   *
   * Every mount goes through this, the first one included: one call, one map, so
   * nothing can disagree about which motor is where. Every simulation flying
   * that configuration is aged, because all of them now fly a different motor.
   */
  setMountMotor: (configId: string, mountId: string, m: MotorSpec) => void;
  /**
   * Set when one mount's motor ignites. `config` changes the one configuration;
   * `all` changes that mount's motor in every configuration and the mount's own
   * ignition too, which is desktop's "Change all configurations using the
   * default ignition event" (IgnitionSelectionDialog).
   */
  setMountIgnition: (
    configId: string,
    mountId: string,
    event: IgnitionEvent,
    delay: number,
    scope?: IgnitionScope,
  ) => void;
  /**
   * Override one deployment field of one recovery device, in one configuration;
   * null clears that field so the device's own value on the design applies again.
   *
   * Per field, like a simulation's preference overrides: a configuration can
   * move the altitude and leave the event where the design put it.
   */
  setDeployment: <K extends keyof DeployOverride>(
    configId: string,
    deviceId: string,
    key: K,
    value: DeployOverride[K] | null,
  ) => void;
  /**
   * Override one separation field of one booster, in one configuration; null
   * clears it so the stage's own value on the design applies again.
   */
  setSeparation: <K extends keyof SepOverride>(
    configId: string,
    stageId: string,
    key: K,
    value: SepOverride[K] | null,
  ) => void;
  /**
   * Fly one stage in this configuration, or leave it on the ground. Refused for
   * the last stage still flying: a rocket with no stages is not a flight.
   */
  setStageFlies: (configId: string, stageId: string, flies: boolean) => void;
  /** Add an empty-default configuration and select it. */
  addConfig: () => void;
  /** Copy one configuration, placing the copy after it, and select it. */
  copyConfig: (id: string) => void;
  /**
   * Write a configuration's name exactly as typed, spaces included, so a
   * controlled input can be typed into. `commitConfigName` tidies it.
   */
  renameConfig: (id: string, name: string) => void;
  /**
   * End a name edit: trim the stored name, store an empty one as unnamed
   * (labeled by its motors), and finalize the edit into one undo step.
   */
  commitConfigName: (id: string) => void;
  /**
   * Delete a configuration. Refused for the last one, since every simulation
   * names the configuration it flies. Rows that flew it move to the first
   * remaining one.
   */
  deleteConfig: (id: string) => void;
}

/**
 * The configuration the Configurations tab is editing: the one it has selected,
 * else the one the active simulation flies.
 *
 * Following the active simulation is what makes arriving at the tab show the
 * setup you were just looking at, rather than an arbitrary row.
 */
export const selectEditedConfig = (s: WorkspaceState): FlightConfig => {
  // A selection whose configuration is gone (an undo of the add that made it)
  // follows the active simulation too, rather than `configFor`'s first row.
  const picked = s.selectedConfigId ? s.configs.find((c) => c.id === s.selectedConfigId) : undefined;
  return picked ?? configFor(s.configs, selectActive(s).configId);
};

/** Motor case dimensions for the 2D/3D views, one per loaded mount. */
export function selectMotorDims(tree: RocketTree, config: FlightConfig): MotorDims {
  const m: MotorDims = {};
  for (const [id, mm] of liveMotors(tree, config)) {
    m[id] = { length: mm.spec.length, diameter: mm.spec.diameter, label: mm.spec.designation };
  }
  return m;
}

/**
 * At least one configuration, always.
 *
 * A curve-less motor inside one is kept as-is: the build does not seat it, so it
 * cannot blank the app, the run stays blocked ("no motor"), and an unresolved
 * `.ork` motor is never silently replaced with a default. Only a wholly missing
 * set falls back to a default loadout.
 */
export function sanitizeConfigs(tree: RocketTree, configs: FlightConfig[]): FlightConfig[] {
  const safe = (Array.isArray(configs) ? configs : []).filter((c) => c && typeof c.id === 'string' && c.motors);
  return reconcileConfigs(tree, safe.length ? safe : [defaultConfig(tree)]);
}

/**
 * Whether two motor specs are the same motor: every field equal, the curve
 * arrays sample by sample. A catalog pick builds a new object each time, so
 * reference equality would call every reseat a change.
 */
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

/** What the configuration actions share with the editing core in store.ts. */
interface ConfigSliceShared extends EditSteps {
  /** The configuration the default workspace starts with. */
  seed: FlightConfig;
}

export const createConfigSlice =
  ({ seed, beginEdit, commitEdit, recordStep }: ConfigSliceShared): StateCreator<WorkspaceState, [], [], ConfigSlice> =>
  (set, get) => {
    /**
     * Edit one flight configuration in place.
     *
     * Shared by design: a configuration is a setup several simulations can point
     * at, so changing its motors changes what all of them fly. That is what the
     * configurations tab is for, and it is why motors are edited there and nowhere
     * else - two surfaces writing the same loadout under different rules is how
     * they come to disagree.
     */
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
        // An unknown configuration, or the motor already in the mount, changes
        // nothing, so it records no undo step and leaves redo alone.
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
          // Every motor on the mount, whatever it had, as the desktop dialog's OK
          // does (MotorMount.getMotorIterator), plus the mount itself. The mount
          // is compared as it flies, so absent keys read as automatic with no delay.
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
        // No motor in that mount, or the timing it already has: nothing to
        // record, so no transaction is opened.
        const seated = get().configs.find((c) => c.id === configId)?.motors[mountId];
        if (!seated || timed(seated)) return;
        beginEdit();
        patchConfig(configId, (c) => {
          const seated = c.motors[mountId];
          if (!seated) return c; // no motor in that mount: nothing to time
          return { ...c, motors: { ...c.motors, [mountId]: { ...seated, ...target } } };
        });
      },
      setDeployment: (configId, deviceId, key, value) => {
        // Already so: no step. An empty one clears redo, and the new config
        // object would read as a changed input and drop a run in flight.
        const config = get().configs.find((c) => c.id === configId);
        if (!config || holdsKey(config.deployments?.[deviceId], key, value)) return;
        beginEdit();
        patchConfig(configId, (c) => {
          // Removed, not stored as undefined: a key left holding `undefined` still
          // counts as an override (`deployOverride`).
          const device = nonEmpty(withKey(c.deployments?.[deviceId], key, value));
          // Likewise for the map: no overrides at all means no `deployments`, which
          // the exporter reads as "this configuration recovers the way the design
          // says".
          return { ...c, deployments: nonEmpty(withKey(c.deployments, deviceId, device ?? null)) };
        });
      },
      setSeparation: (configId, stageId, key, value) => {
        const config = get().configs.find((c) => c.id === configId);
        if (!config || holdsKey(config.separations?.[stageId], key, value)) return;
        beginEdit();
        patchConfig(configId, (c) => {
          // Same shape as the deployment override above, field by field: an empty
          // stage entry is removed, and an empty map takes `separations` with it.
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
        // Something has to fly. Grounding the last one leaves the builder an empty
        // rocket, which the kernel refuses. The checkbox of the only flying stage
        // is disabled and says why (SeparationSection), so this is the guard a
        // programmatic call cannot get past.
        if (stages.every((id) => grounded.has(id))) return;
        const next = stages.filter((id) => grounded.has(id)); // tree order, not click order
        const before = current.grounded ?? [];
        // Already so: no change, so no undo step.
        if (next.length === before.length && next.every((id, i) => id === before[i])) return;
        recordStep();
        patchConfig(configId, (c) => ({ ...c, ...(next.length ? { grounded: next } : { grounded: undefined }) }));
      },
      addConfig: () => {
        recordStep();
        const s = get();
        // Always a new one, even when an identical loadout is already there: this
        // is the button that says "another setup", and one that silently selected
        // an existing row would be a button that does nothing.
        const made = defaultConfig(s.tree);
        set({ configs: [...s.configs, made], selectedConfigId: made.id });
      },
      copyConfig: (id) => {
        const s = get();
        const src = s.configs.find((c) => c.id === id);
        if (!src) return;
        recordStep();
        // Named copies say so; an unnamed one stays unnamed, because its label is
        // its motor list and "Estes C6 copy" would name a thing nobody named.
        const copy: FlightConfig = newFlightConfig(
          { ...src.motors },
          src.name === null ? null : i18n.t('configs.copyName', { name: src.name }),
        );
        // Everything else the configuration overrides comes along too, as
        // desktop's copy runs copyFlightConfiguration on every configurable
        // component: a copy made to vary the motor must not quietly differ in
        // recovery or staging.
        if (src.deployments) copy.deployments = { ...src.deployments };
        if (src.separations) copy.separations = { ...src.separations };
        if (src.grounded) copy.grounded = [...src.grounded];
        set({ configs: insertAfter(s.configs, id, copy), selectedConfigId: copy.id });
      },
      renameConfig: (id, name) => {
        // Untrimmed while typing: trimming here would eat the space before the
        // next word reaches the box.
        const next = name === '' ? null : name;
        const current = get().configs.find((c) => c.id === id);
        if (!current || current.name === next) return;
        beginEdit();
        set((s) => ({ configs: replaceById(s.configs, id, (c) => ({ ...c, name: next })) }));
      },
      commitConfigName: (id) => {
        const current = get().configs.find((c) => c.id === id);
        // Empty means unnamed, not a blank name: the label falls back to the motor
        // list, which is what the desktop shows and what a blank row could not.
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
        if (!rest.length) return; // the last one: every simulation needs one to fly
        recordStep();
        // The rows that flew it have to fly something, so they take the first
        // remaining configuration.
        const fallback = rest[0]!.id;
        set({
          configs: rest,
          sims: s.sims.map((x) => (x.configId === id ? { ...x, configId: fallback } : x)),
          selectedConfigId: s.selectedConfigId === id ? fallback : s.selectedConfigId,
        });
      },
    };
  };
