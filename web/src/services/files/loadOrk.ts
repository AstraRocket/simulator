import { must } from '../app/must';
import type { OrkSimulation } from './ork/importSimulations';
import {
  OpenRocketDesign,
  engineActive,
  resetEngine,
  type StaticInfo,
  type IgnitionEvent,
  type RocketTree,
  type MotorSpec,
  type ComponentNode,
} from '../../engine/openRocketEngine';
import { parseDesignFile, type DesignFormat } from './designFile';
import type { OrkExportMotor } from './orkFile';
import type { LaunchConditions } from '../design/orkTree';
import { loadCatalog, matchCatalogMotor, type CatalogMotor, type MotorMatchDoubt } from '../motors/motorDb';
import { customMotorToSpec, catalogMotorSpec } from '../motors/motorSpec';
import { parseRse, removeDelay } from '../motors/rseParser';
import type { CustomMotor } from '../motors/motorStore';
import { type OrkMotorRef, defaultOrkConfig } from './orkTypes';
import { findMounts } from '../design/treeEdit';
import { IGNITION_EVENTS } from '../design/componentFields';
import { motorFitsMount, mountFit } from '../motors/motorPicker';
import { hasUsableCurve } from '../motors/motorCurve';
import { mountIgnition, type FlightConfig, type MountMotor } from '../flight/flightConfigs';
import { errorReason } from '../../i18n/keyedError';
import { roundTo } from '../app/numbers';
import { rseDigest } from './ork/embeddedMotors';
import { keyedNote, noteList, notePartName, type ImportNote } from './importNote';
import { toCatalogMm } from '../motors/catalogUnits';

type LoadedConfig = FlightConfig;

export interface LoadedOrk {
  name: string;
  format?: DesignFormat;
  /** Null when opened before the engine loaded; the app rebuilds from `tree`. */
  design: OpenRocketDesign | null;
  info: StaticInfo | null;
  notes: ImportNote[];
  tree: RocketTree;
  motors: Record<string, OrkExportMotor>;
  /** Every declared configuration, never empty; dropping any would lose it on save. */
  configs: LoadedConfig[];
  chosenConfigId: string;
  launch?: Partial<LaunchConditions>;
  simulations?: OrkSimulation[];
  /** When set, `design`/`info` come from a repaired copy: read neither. */
  unbuildable?: ImportNote;
}

const IGNITION_EVENT_NAMES: ReadonlySet<string> = new Set(IGNITION_EVENTS);

// No curve, so the run is blocked rather than silently flying a default C6.
function unresolvedMotor(ref: {
  designation: string;
  manufacturer?: string;
  diameter: number;
  length: number;
  delay: number;
}): MotorSpec {
  return {
    designation: ref.designation,
    manufacturer: ref.manufacturer,
    diameter: ref.diameter,
    length: ref.length,
    times: [],
    thrusts: [],
    masses: [],
    cgX: ref.length / 2,
    ejectionDelay: ref.delay,
  };
}

// A mount with no entry at all is seeded a default C6 (`flightConfigs.reconcileConfig`).
export function emptyMountMotor(): MotorSpec {
  return {
    designation: '',
    diameter: 0,
    length: 0,
    times: [],
    thrusts: [],
    masses: [],
    cgX: 0,
    ejectionDelay: 0,
  };
}

function mountMotor(ref: OrkMotorRef, spec: MotorSpec): MountMotor {
  const entry: MountMotor = { spec };
  if (ref.ignitionEvent && IGNITION_EVENT_NAMES.has(ref.ignitionEvent)) {
    entry.ignitionEvent = ref.ignitionEvent as IgnitionEvent;
    entry.ignitionDelay = ref.ignitionDelay ?? 0;
  }
  return entry;
}

// Keyed without delay: the `.ork` names `J350-14` but embeds `J350`.
function embeddedCurves(
  files: string[] | undefined,
  notes: ImportNote[],
): { byName: Map<string, CustomMotor>; byDigest: Map<string, CustomMotor> } {
  const byName = new Map<string, CustomMotor>();
  const byDigest = new Map<string, CustomMotor>();
  for (const text of files ?? []) {
    try {
      const motors = parseRse(text);
      for (const motor of motors) {
        const key = removeDelay(motor.designation).toUpperCase();
        if (!byName.has(key)) byName.set(key, motor);
      }
      // A `.ork` names an embedded motor by desktop's digest; one motor per file.
      const digest = motors.length === 1 ? rseDigest(text) : null;
      if (digest) byDigest.set(digest, motors[0]!);
    } catch {
      notes.push(keyedNote('importNote.embeddedCurveUnreadable'));
    }
  }
  return { byName, byDigest };
}

// A self-crossing freeform fin makes the kernel refuse the tree; retry without outlines so it opens.
export function buildForImport(tree: RocketTree): { design: OpenRocketDesign; unbuildable?: ImportNote } {
  try {
    return { design: OpenRocketDesign.buildTree(tree) };
  } catch (e) {
    const reason = errorReason(e);
    let repaired;
    try {
      repaired = OpenRocketDesign.buildTree(withoutFreeformOutlines(tree));
    } catch {
      throw e; // the original error is the useful one
    }
    return {
      design: repaired,
      unbuildable: keyedNote('importNote.unbuildable', { reason }),
    };
  }
}

function withoutFreeformOutlines(tree: RocketTree): RocketTree {
  const strip = (nodes: ComponentNode[] | undefined): ComponentNode[] | undefined =>
    nodes?.map((n) => {
      const kids = strip(n.children);
      const next = { ...n, ...(kids ? { children: kids } : {}) } as ComponentNode & { points?: unknown };
      if (next.type === 'freeformfinset') delete next.points;
      return next;
    });
  return { ...tree, components: strip(tree.components) ?? [] };
}

// eslint-disable-next-line complexity -- one import pipeline whose steps run in order over shared notes
export async function loadOrk(buffer: ArrayBuffer): Promise<LoadedOrk> {
  const res = parseDesignFile(buffer);
  // Reset only after the parse: it voids the open design's handle, which must survive a bad file.
  let built: ReturnType<typeof buildForImport> | null = null;
  if (engineActive()) {
    resetEngine();
    built = buildForImport(res.tree);
  }
  const design = built?.design ?? null;

  const notes: ImportNote[] = [...(res.notes ?? [])];
  if (built?.unbuildable) notes.push(built.unbuildable);

  const catalog = await loadCatalog();
  const embedded = embeddedCurves(res.embeddedMotors, notes);

  const round1 = (mm: number): string => String(roundTo(mm, 1));

  // The digest is part of the key: two custom curves sharing a designation are two motors.
  const resolved = new Map<string, MotorSpec>();
  const resolveMotor = async (ref: OrkMotorRef): Promise<MotorSpec> => {
    const key = `${(ref.manufacturer ?? '').toLowerCase()}|${ref.designation.toLowerCase()}|${ref.delay}|${ref.digest ?? ''}`;
    const hit = resolved.get(key);
    if (hit) return hit;
    const spec = await resolveOnce(ref);
    resolved.set(key, spec);
    return spec;
  };
  const noteDoubt = (ref: OrkMotorRef, cat: CatalogMotor, doubt: MotorMatchDoubt): void => {
    const values = { motor: ref.designation, loaded: `${cat.manufacturer} ${cat.designation}` };
    notes.push(keyedNote(doubt === 'shortened' ? 'importNote.motorShortened' : 'importNote.motorAmbiguous', values));
  };

  const resolveOnce = async (ref: OrkMotorRef): Promise<MotorSpec> => {
    if (!ref.designation) {
      const byDigest = ref.digest ? embedded.byDigest.get(ref.digest) : undefined;
      return byDigest ? customMotorToSpec(byDigest, ref.delay) : unresolvedMotor(ref);
    }
    const own = () => embedded.byName.get(removeDelay(ref.designation).toUpperCase());
    const match = matchCatalogMotor(catalog, ref.designation, ref.manufacturer);
    // The maker is a filter (ThrustCurveMotorSetDatabase.findMotors) unless the digest confirms the motor.
    const digestConfirms = !!ref.digest && !!match?.motor.digests?.some((d) => d.digest === ref.digest);
    const otherMaker = match?.doubt === 'maker' && !digestConfirms;
    const cat = otherMaker ? undefined : match?.motor;
    // Prefer the embedded curve by digest unless the catalog holds that exact motor.
    const named = ref.digest ? embedded.byDigest.get(ref.digest) : undefined;
    if (named && !cat?.digests?.some((d) => d.digest === ref.digest)) return customMotorToSpec(named, ref.delay);
    if (match?.doubt && match.doubt !== 'maker') noteDoubt(ref, match.motor, match.doubt);
    if (!cat) {
      const curve = own();
      if (curve) {
        notes.push(keyedNote('importNote.motorFileCurve', { motor: ref.designation }));
        return customMotorToSpec(curve, ref.delay);
      }
      notes.push(
        otherMaker
          ? keyedNote('importNote.motorOtherMaker', {
              motor: ref.designation,
              maker: ref.manufacturer ?? '',
              catalogMaker: match.motor.manufacturer,
            })
          : keyedNote('importNote.motorNotInCatalog', { motor: ref.designation }),
      );
      return unresolvedMotor(ref);
    }
    try {
      return await catalogMotorSpec(cat, ref.delay);
    } catch (e) {
      const curve = own();
      if (curve) {
        notes.push(keyedNote('importNote.motorNoCurveFileCurve', { motor: ref.designation }));
        return customMotorToSpec(curve, ref.delay);
      }
      // Never leave the mount empty: it would be seeded a default C6.
      notes.push(keyedNote('importNote.motorFetchFailed', { motor: ref.designation, reason: errorReason(e) }));
      return unresolvedMotor(ref);
    }
  };

  const declared = res.configs?.length ? res.configs : [defaultOrkConfig({ motors: res.motors ?? {} })];
  const chosenConfigId = (declared.find((c) => c.id === res.chosenConfigId) ?? declared[0]!).id;

  const mountNodes = findMounts(res.tree);
  const byId = new Map(mountNodes.map((m) => [m.id as string, m]));
  const misfits = new Set<string>();
  // Seats a misfit anyway: the file states what was built, and the fit tolerance is a guess.
  const checkFit = (mountId: string, spec: MotorSpec): void => {
    const node = byId.get(mountId);
    const fit = node ? mountFit(node) : null;
    if (!node || !fit || !spec.designation || !(spec.diameter > 0)) return;
    const motor = { diameter: toCatalogMm(spec.diameter), length: spec.length ? toCatalogMm(spec.length) : undefined };
    if (motorFitsMount(motor, fit)) return;
    const key = `${mountId}|${spec.designation}`;
    if (misfits.has(key)) return;
    misfits.add(key);
    const mount = notePartName(node);
    const tooWide = motor.diameter > fit.bore;
    notes.push(
      tooWide
        ? keyedNote('importNote.motorTooWide', {
            motor: spec.designation,
            mount,
            diameter: round1(motor.diameter),
            bore: round1(fit.bore),
          })
        : keyedNote('importNote.motorTooLong', {
            motor: spec.designation,
            mount,
            length: round1(motor.length ?? 0),
            maxLength: round1(fit.maxLength ?? 0),
          }),
    );
  };

  const configs: LoadedConfig[] = [];
  for (const cfg of declared) {
    const motors: Record<string, MountMotor> = {};
    for (const [mountId, ref] of Object.entries(cfg.motors ?? {})) {
      const spec = await resolveMotor(ref);
      checkFit(mountId, spec);
      motors[mountId] = mountMotor(ref, spec);
    }
    // Empty mounts carry the mount's own ignition, as desktop does.
    for (const node of mountNodes) {
      const id = node.id as string;
      if (!motors[id]) motors[id] = { spec: emptyMountMotor(), ...mountIgnition(node) };
    }
    configs.push({
      id: cfg.id,
      name: cfg.name,
      motors,
      ...(Object.keys(cfg.deployments ?? {}).length ? { deployments: cfg.deployments } : {}),
      ...(Object.keys(cfg.separations ?? {}).length ? { separations: cfg.separations } : {}),
      ...(cfg.grounded?.length ? { grounded: cfg.grounded } : {}),
    });
  }

  const chosen = must(
    configs.find((c) => c.id === chosenConfigId),
    'chosen configuration',
  );
  const emptyMounts = findMounts(res.tree).filter((m) => !hasUsableCurve(chosen.motors[m.id as string]?.spec));
  if (emptyMounts.length) {
    const named = emptyMounts.filter((m) => !chosen.motors[m.id as string]?.spec.designation);
    if (named.length) {
      const names = noteList(named.map(notePartName), { quote: true });
      notes.push(keyedNote('importNote.mountsWithoutMotor', { mounts: names }));
    }
  }

  if (design) {
    for (const [mountId, m] of Object.entries(chosen.motors)) {
      if (!hasUsableCurve(m.spec)) continue;
      design.setMotorById(mountId, m.spec);
      if (m.ignitionEvent || m.ignitionDelay) {
        design.setMotorIgnitionById(mountId, m.ignitionEvent ?? 'automatic', m.ignitionDelay ?? 0);
      }
    }
  }

  const info = design?.staticInfo() ?? null;
  return {
    name: res.name,
    ...(res.format ? { format: res.format } : {}),
    design,
    info,
    notes,
    tree: res.tree,
    motors: res.motors,
    configs,
    chosenConfigId,
    launch: res.launch,
    ...(res.simulations ? { simulations: res.simulations } : {}),
    unbuildable: built?.unbuildable,
  };
}
