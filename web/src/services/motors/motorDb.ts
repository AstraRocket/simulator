import { getMotorStore, type CustomMotor } from './motorStore';
import { MIN_CURVE_SAMPLES } from './motorCurve';
import { parseEng, totalImpulse } from './engParser';
import { parseRse } from './rseParser';
import { finalizeCurve } from './curveFinalize';
import { motorStatistics } from '../../engine/openRocketEngine';
import { impulseClass } from './motorCombine';
import { motorFitsMount, offersPlugged, parseDelays, type MountFit } from './motorPicker';
import { fetchCatalog } from '../app/remoteData';
import { noteCatalogLoad } from '../app/catalogUpdates';
import { PLUGGED_DELAY } from '../../engine/openRocketEngine';
import { keyOf } from './motorKey';
import { toError } from '../app/errorMessage';
import { assertImportSize, readFileText } from '../files/decodeText';
import { distinctSorted } from '../app/collections';
import { passesPerf, type PerfDef, type PerfRanges } from './motorPerf';

export interface CatalogMotor {
  designation: string;
  manufacturer: string;
  class: string;
  /** mm. */
  diameter: number;
  /** Ns. */
  impulse: number;
  /** s. */
  burn: number;
  /** Loaded mass, g. */
  mass: number;
  /** `id` is the CustomMotor id. */
  custom?: boolean;
  id?: string;
  length?: number; // mm
  propWeightG?: number; // g
  /** Best first; [time (s), thrust (N)]. */
  curves?: { src: string; samples: [number, number][] }[];
  code?: string; // full manufacturer designation, e.g. "E26W"
  type?: string; // 'SU' | 'reload' | 'hybrid'
  delays?: string; // e.g. "4,6,7,8,10"
  propInfo?: string;
  sparky?: boolean;
  avgThrust?: number; // N
  maxThrust?: number; // N
  noCurve?: boolean;
  oop?: boolean;
  digests?: { digest: string; delays: (number | 'P')[] }[];
  /** [[t (s), cgFromNose (m)]]. Absent: mid-length, as OpenRocket does. */
  cg?: [number, number][];
}

/** Undefined when desktop has no entry, so no wrong digest is written. */
export function catalogDigest(cat: CatalogMotor, ejectionDelay: number): string | undefined {
  const entries = cat.digests;
  if (!entries?.length) return undefined;
  const want: number | 'P' = ejectionDelay >= PLUGGED_DELAY ? 'P' : Math.round(ejectionDelay);
  return (entries.find((e) => e.delays.includes(want)) ?? entries[0]!).digest;
}

export function hasCurve(m: CatalogMotor): boolean {
  return (m.curves?.[0]?.samples?.length ?? 0) >= MIN_CURVE_SAMPLES;
}

export function hasLocalCurve(m: CatalogMotor): boolean {
  return !!m.custom || hasCurve(m);
}

function customToRow(cm: CustomMotor): CatalogMotor {
  const samples = finalizeCurve(cm.samples);
  const last = samples[samples.length - 1];
  const impulse = totalImpulse(samples);
  // Null before the engine loads; the next picker open fills them.
  const kernel = motorStatistics(samples.map((p) => [p.time, p.thrust] as const));
  return {
    designation: cm.designation,
    manufacturer: cm.manufacturer,
    class: impulseClass(impulse),
    diameter: cm.diameter,
    impulse,
    burn: kernel?.burnTime ?? (last ? last.time : 0),
    ...(kernel ? { avgThrust: kernel.averageThrust } : {}),
    mass: cm.totalWeightG,
    custom: true,
    id: cm.id,
    length: cm.length,
    propWeightG: cm.propWeightG,
    type: cm.type,
    delays: cm.delayList,
  };
}

// The catalog can come from a separate data host; one malformed field would take down the picker.
const isCatalogMotor = (v: unknown): v is CatalogMotor => {
  const m = v as CatalogMotor | null;
  return (
    !!m &&
    typeof m === 'object' &&
    typeof m.designation === 'string' &&
    typeof m.manufacturer === 'string' &&
    typeof m.class === 'string' &&
    Number.isFinite(m.diameter) &&
    Number.isFinite(m.impulse) &&
    optionalString(m.code) &&
    optionalString(m.type) &&
    optionalString(m.delays) &&
    (m.curves === undefined ||
      (Array.isArray(m.curves) && m.curves.every((c) => !!c && typeof c === 'object' && isPairList(c.samples)))) &&
    (m.cg === undefined || isPairList(m.cg)) &&
    (m.digests === undefined || (Array.isArray(m.digests) && m.digests.every(isDigestEntry)))
  );
};

const optionalString = (v: unknown): boolean => v === undefined || typeof v === 'string';

const isPairList = (v: unknown): boolean =>
  Array.isArray(v) &&
  v.every((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));

const isDigestEntry = (v: unknown): boolean => {
  const e = v as { digest?: unknown; delays?: unknown } | null;
  return (
    !!e &&
    typeof e === 'object' &&
    typeof e.digest === 'string' &&
    Array.isArray(e.delays) &&
    e.delays.every((d) => d === 'P' || Number.isFinite(d))
  );
};

/** `some`, not `every`: one bad row must not empty the picker; `loadCatalog` drops it. */
const isCatalog = (v: unknown): boolean => Array.isArray(v) && v.some(isCatalogMotor);

export async function loadCatalog(): Promise<CatalogMotor[]> {
  const [custom, bundled] = await Promise.all([
    getMotorStore()
      .listCustomMotors()
      .then((ms) => ms.map(customToRow)),
    fetchCatalog<unknown[]>('motors', isCatalog).then((rows) => {
      const motors = rows.filter(isCatalogMotor);
      noteCatalogLoad('motors', () => motors.map(keyOf));
      return motors;
    }),
  ]);
  return [...custom, ...bundled];
}

export type MotorFileInput = { name: string; text: string } | { name: string; blob: Blob };

/** Format is chosen by content, not extension: `.rse` files arrive misnamed. */
export async function importCustomMotors(
  files: readonly MotorFileInput[],
): Promise<{ catalog: CatalogMotor[]; imported: number; failed: string[] }> {
  const motors: CustomMotor[] = [];
  const failed: string[] = [];
  let firstError: Error | null = null;
  for (const f of files) {
    const { name } = f;
    try {
      const text = 'blob' in f ? await readFileText(f.blob) : f.text;
      assertImportSize(text.length);
      motors.push(...(text.trimStart().startsWith('<') ? parseRse(text) : parseEng(text)));
    } catch (err) {
      failed.push(name);
      firstError ??= toError(err);
    }
  }
  if (motors.length === 0 && firstError) throw firstError;
  const merged = mergeByDelay(motors);
  await getMotorStore().addCustomMotors(merged);
  return { catalog: await loadCatalog(), imported: merged.length, failed };
}

/** C6-3, C6-5 and C6-7 are one motor, as desktop's `ThrustCurveMotorSet` groups them. */
function mergeByDelay(motors: readonly CustomMotor[]): CustomMotor[] {
  const byId = new Map<string, CustomMotor>();
  for (const m of motors) {
    const prev = byId.get(m.id);
    byId.set(m.id, prev ? { ...m, delayList: unionDelays(prev.delayList, m.delayList) } : m);
  }
  return [...byId.values()];
}

function unionDelays(a: string | undefined, b: string | undefined): string | undefined {
  const pa = parseDelays(a);
  const pb = parseDelays(b);
  const parts = [...new Set([...pa.delays, ...pb.delays])].sort((x, y) => x - y).map(String);
  if (pa.plugged || pb.plugged) parts.push('P');
  return parts.length ? parts.join(',') : undefined;
}

export async function deleteCustomMotor(id: string): Promise<CatalogMotor[]> {
  await getMotorStore().removeCustomMotor(id);
  return loadCatalog();
}

export const SPARKY_CHOICES = ['any', 'only', 'none'] as const;
export type SparkyChoice = (typeof SPARKY_CHOICES)[number];

export interface MotorFilter {
  classes: Set<string>;
  manufacturers: Set<string>;
  text: string;
  /** mm. */
  minDiameter?: number;
  maxDiameter?: number;
  /** N·s. */
  minImpulse?: number;
  maxImpulse?: number;
  /** SI. */
  perf?: PerfRanges;
  perfFields?: readonly PerfDef[];
  fit?: MountFit;
  /** Motors the manufacturer lists as plugged, not merely flyable plugged. */
  plugged?: boolean;
  sparky?: SparkyChoice;
  hideOop?: boolean;
  hide?: ReadonlySet<string>;
}

export function filterMotors(catalog: CatalogMotor[], filter: MotorFilter): CatalogMotor[] {
  const text = filter.text.trim().toLowerCase();
  return catalog.filter((m) => {
    if (filter.classes.size > 0 && !filter.classes.has(m.class)) return false;
    if (filter.manufacturers.size > 0 && !filter.manufacturers.has(m.manufacturer)) return false;
    if (filter.minDiameter != null && m.diameter < filter.minDiameter) return false;
    if (filter.maxDiameter != null && m.diameter > filter.maxDiameter) return false;
    if (filter.minImpulse != null && m.impulse < filter.minImpulse) return false;
    if (filter.maxImpulse != null && m.impulse > filter.maxImpulse) return false;
    if (filter.perf && !passesPerf(m, filter.perf, filter.perfFields)) return false;
    if (filter.fit && !motorFitsMount(m, filter.fit)) return false;
    if (filter.plugged && !offersPlugged(m)) return false;
    if (filter.sparky === 'only' && !m.sparky) return false;
    if (filter.sparky === 'none' && m.sparky) return false;
    if (filter.hideOop && m.oop) return false;
    if (filter.hide && filter.hide.has(keyOf(m))) return false;
    if (text && !m.designation.toLowerCase().includes(text) && !(m.code ?? '').toLowerCase().includes(text))
      return false;
    return true;
  });
}

export function allClasses(catalog: CatalogMotor[]): string[] {
  return distinctSorted(catalog, (m) => m.class);
}

export function allManufacturers(catalog: CatalogMotor[]): string[] {
  return distinctSorted(catalog, (m) => m.manufacturer);
}

export type MotorMatchDoubt = 'maker' | 'shortened' | 'several';

export interface MotorMatch {
  motor: CatalogMotor;
  doubt?: MotorMatchDoubt;
}

/**
 * Files store the full designation ("H128W"); the catalog keys the short name with the full one in
 * `code`. The manufacturer is a tiebreak, not a filter, so a Kosdon `I170-P` reports a `doubt`.
 */
export function matchCatalogMotor(
  catalog: CatalogMotor[],
  designation: string,
  manufacturer?: string,
): MotorMatch | undefined {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[-\s]/g, '');
  const raw = designation.trim();
  const want = raw.toLowerCase();
  if (!want) return undefined;
  const code = (m: CatalogMotor) => (m.code ?? '').toLowerCase();

  // Never let the manufacturer preference empty a non-empty set.
  const byMfr = (cands: CatalogMotor[]): CatalogMotor[] => {
    if (!manufacturer || cands.length <= 1) return cands;
    const mf = manufacturer.trim().toLowerCase();
    const hit = cands.filter((m) => sameMaker(m.manufacturer, mf));
    return hit.length ? hit : cands;
  };

  // One segment at a time (RockSim writes `26-E31-WH-15A` for `E31`); each keeps a letter so digits alone never match.
  const shrink = (name: string): string[] => {
    const out: string[] = [];
    for (let s = name; s.length > 1; s = s.replace(/[-_][^-_]*$/, '')) {
      out.push(s, s.replace(/[A-Za-z]+$/, '').replace(/[-_]+$/, ''));
      if (!/[-_]/.test(s)) break;
    }
    return out.filter((c) => c.length > 1 && /[A-Za-z]/.test(c));
  };
  // `206J530-IM` to `J530-IM`; only when a letter follows, so "1/2A6" is left alone.
  const noImpulse = raw.replace(/^\d+[-_]?(?=[A-Za-z])/, '');
  const stripped = [...new Set([...shrink(raw), ...(noImpulse === raw ? [] : shrink(noImpulse))])]
    .map((s) => s.toLowerCase())
    .filter((s) => s && s !== want);

  const tiers: Array<() => CatalogMotor[]> = [
    () => catalog.filter((m) => m.designation.toLowerCase() === want),
    () => catalog.filter((m) => code(m) === want),
    () => catalog.filter((m) => norm(m.designation) === norm(raw) || norm(m.code ?? '') === norm(raw)),
    () => catalog.filter((m) => stripped.some((s) => m.designation.toLowerCase() === s || code(m) === s)),
  ];
  const shortenedTier = tiers.length - 1;
  for (let i = 0; i < tiers.length; i++) {
    const hit = byMfr(tiers[i]!());
    if (!hit.length) continue;
    const motor = hit[0]!;
    return { motor, ...(doubtAbout(motor, hit.length, i === shortenedTier, manufacturer) ?? {}) };
  }
  return undefined;
}

/** `asked` already trimmed and lowercased. */
export function sameMaker(catalogMaker: string, asked: string): boolean {
  const got = catalogMaker.toLowerCase();
  return got === asked || got.includes(asked) || asked.includes(got);
}

function doubtAbout(
  motor: CatalogMotor,
  candidates: number,
  shortened: boolean,
  manufacturer?: string,
): { doubt: MotorMatchDoubt } | undefined {
  const asked = manufacturer?.trim().toLowerCase();
  // Same test `byMfr` prefers by.
  if (asked && !sameMaker(motor.manufacturer, asked)) return { doubt: 'maker' };
  if (shortened) return { doubt: 'shortened' };
  if (candidates > 1) return { doubt: 'several' };
  return undefined;
}
