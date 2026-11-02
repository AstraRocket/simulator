import { isaAt } from './recoverySizing';
import { uiToSi } from '../../prefs/units';
import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { num } from '../../tree/nodeProps';
import { walkNodes } from '../../tree/treeWalk';
import { finMountOf, finPlanformPoints, finRootChord, finSpan, type FinParent } from '../../tree/finPlanform';

/**
 * Fin flutter speed: how fast a fin can fly before the air drives it into a
 * twisting oscillation that grows until the fin breaks.
 *
 * The estimate is NACA Technical Note 4197 (Martin, 1958), the one hobby
 * flutter calculators use:
 *
 *     Vf = a . sqrt( G / ( 39.3 AR^3 / ((t/c)^3 (AR + 2)) . (lambda + 1) / 2 . P / P0 ) )
 *
 * with a the speed of sound and P the air pressure where the fin flies, P0 the
 * sea-level pressure, G the fin material's shear modulus in psi, AR the aspect
 * ratio span^2 / area, lambda the taper ratio tip / root, and t/c the thickness
 * over the root chord. The 39.3 is in psi, so G is converted to psi and the
 * pressure enters only as the ratio P / P0.
 *
 * It is a plate model with an empirical constant: a solid fin of uniform
 * thickness, clamped at the root. It knows nothing of airfoil edges, fillets,
 * tip-to-tip layups or through-the-wall tabs, all of which stiffen a real fin,
 * and it is rough at its best. That is why the verdict asks for a margin
 * rather than treating the speed as a line.
 */

/** Ratio of specific heats for air. */
const GAMMA = 1.4;
/** Specific gas constant of dry air, J/(kg.K), the kernel's own value. */
const R_AIR = 287.053;
/** Sea-level standard pressure, Pa: the note's P0. */
const P0 = 101325;
/** The note's constant, which carries psi. */
const NACA_CONSTANT_PSI = 39.3;
const PSI = uiToSi('pressure', 'psi', 1);

/** A trapezoidal fin's planform and thickness, in meters. */
export interface FlutterFin {
  rootChordM: number;
  /** 0 for a pointed (triangular) fin. */
  tipChordM: number;
  /** Root to tip, perpendicular to the body: the fin's height. */
  spanM: number;
  thicknessM: number;
}

/**
 * The flutter speed (m/s) of `fin` in the standard atmosphere `altitudeM` m
 * above sea level, and the Mach number it stands for there; null for a fin
 * without a positive root chord, span and thickness, a negative tip chord, or
 * a shear modulus that is not positive.
 */
export function flutterSpeed(
  fin: FlutterFin,
  shearModulusPa: number,
  altitudeM: number,
): { speedMs: number; mach: number } | null {
  const { t, p } = isaAt(altitudeM);
  return flutterSpeedIn(fin, shearModulusPa, p, Math.sqrt(GAMMA * R_AIR * t));
}

/**
 * The flutter speed (m/s) of `fin` in air at `pressurePa` with a speed of sound
 * of `soundMs`: a run's recorded air rather than the standard atmosphere.
 */
export function flutterSpeedIn(
  fin: FlutterFin,
  shearModulusPa: number,
  pressurePa: number,
  soundMs: number,
): { speedMs: number; mach: number } | null {
  const mach = flutterMach(fin, shearModulusPa, pressurePa);
  return mach == null || !(soundMs > 0) ? null : { speedMs: mach * soundMs, mach };
}

/**
 * The note's flutter speed as a Mach number, in air at `pressurePa`: the
 * speed of sound cancels out of everything but the conversion to m/s. Null for
 * a fin or modulus {@link flutterSpeed} refuses, or a pressure that is not
 * positive.
 */
function flutterMach(fin: FlutterFin, shearModulusPa: number, pressurePa: number): number | null {
  const { rootChordM: root, tipChordM: tip, spanM: span, thicknessM: thick } = fin;
  if (!(root > 0) || !(tip >= 0) || !(span > 0) || !(thick > 0) || !(shearModulusPa > 0) || !(pressurePa > 0)) {
    return null;
  }
  const area = ((root + tip) / 2) * span;
  const ar = (span * span) / area;
  const taper = tip / root;
  const tc = thick / root;
  const denominator = ((NACA_CONSTANT_PSI * ar ** 3) / (tc ** 3 * (ar + 2))) * ((taper + 1) / 2) * (pressurePa / P0);
  return Math.sqrt(shearModulusPa / PSI / denominator);
}

/**
 * Below this many times the flight's top speed the estimate is too close to
 * call. A judgment, not a code: the note's own scatter and a real fin's build
 * both move the answer by more than a few percent, so the margin is set wide
 * enough to absorb them.
 */
export const FLUTTER_MARGIN = 1.25;

export type FlutterVerdict = 'over' | 'marginal' | 'ok';

/** How the flutter speed sits against the top speed, from their ratio. */
export function flutterVerdict(ratio: number): FlutterVerdict {
  if (ratio < 1) return 'over';
  if (ratio < FLUTTER_MARGIN) return 'marginal';
  return 'ok';
}

/**
 * Typical shear moduli (Pa) for the fin stocks hobby rockets fly. Each is a
 * starting point for a material whose real value varies by maker, layup, grain
 * and, for a printed fin, infill and print direction; the tool lets a measured
 * or published figure replace it. Keys stay literal so the i18n key scan finds
 * their labels.
 */
export const FIN_MATERIALS = [
  /** The figure Apogee's flutter articles use, 425,000 psi. */
  { key: 'g10', shearModulusPa: 425000 * PSI },
  /** Aircraft birch plywood, about 90,000 psi across the plies. */
  { key: 'plywood', shearModulusPa: 90000 * PSI },
  /** Contest-grade balsa, about 20,000 psi. */
  { key: 'balsa', shearModulusPa: 20000 * PSI },
  /** Solid-printed PLA, about 1.2 GPa; less with infill. */
  { key: 'pla', shearModulusPa: 1.2e9 },
  /** Solid-printed PETG, about 0.77 GPa. */
  { key: 'petg', shearModulusPa: 0.77e9 },
  /** 6061-T6 aluminum, 26 GPa. */
  { key: 'aluminum', shearModulusPa: 26e9 },
] as const;

export type FinMaterialKey = (typeof FIN_MATERIALS)[number]['key'];

/**
 * The fin stock each built-in material is, by the name the catalog gives it.
 * Only names that are the stock the table describes: solid birch is not
 * plywood, and carbon fiber's shear modulus depends on its layup too much for
 * one typical figure, so neither is matched and the reader types a value.
 */
const STOCK_BY_MATERIAL: Readonly<Record<string, FinMaterialKey>> = {
  Fiberglass: 'g10',
  'Plywood (birch)': 'plywood',
  Balsa: 'balsa',
  'PLA - 100% infill': 'pla',
  'PETG - 100% infill': 'petg',
  Aluminum: 'aluminum',
};

/** The fin stock a design material is, or null when the table has no figure for it. */
export function finStockFor(materialName: unknown): FinMaterialKey | null {
  return typeof materialName === 'string' && Object.hasOwn(STOCK_BY_MATERIAL, materialName)
    ? STOCK_BY_MATERIAL[materialName]!
    : null;
}

/**
 * A planar fin set as the flutter estimate takes it: the trapezoid with the
 * fin's own root chord, span and area, so its aspect ratio is the fin's. For a
 * trapezoidal fin that is the fin itself; an elliptical or freeform fin gets
 * the tip chord that gives the same area. Null for tube fins, a degenerate
 * outline, or a fin with no thickness.
 *
 * `parent` is where the fin stands (`finMountOf`), which a freeform fin's span
 * depends on.
 */
export function flutterFin(node: ComponentNode, parent: FinParent = null): FlutterFin | null {
  const pts = finPlanformPoints(node);
  if (!pts) return null;
  const rootChordM = finRootChord(node);
  const spanM = finSpan(node, parent);
  const thicknessM = num(node, 'thickness');
  if (!(rootChordM > 0) || !(spanM > 0) || !(thicknessM > 0)) return null;
  let twice = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[(i + 1) % pts.length]!;
    twice += x0 * y1 - x1 * y0;
  }
  const area = Math.abs(twice) / 2;
  return { rootChordM, tipChordM: Math.max(0, (2 * area) / spanM - rootChordM), spanM, thicknessM };
}

/** The point of a flight where the fins come closest to their flutter speed. */
export interface FlutterPoint {
  /** Seconds after launch. */
  time: number;
  /** Airspeed, m/s (the speed over the ground for a run without its air). */
  speedMs: number;
  /** Above the launch site, m. */
  altitudeM: number;
  /** The fins' flutter speed there, m/s. */
  flutterMs: number;
  /** `flutterMs / speedMs`: below 1, the fins are past it. */
  ratio: number;
}

/** The series a flight's flutter margin is read from. */
export interface FlutterSeries {
  time: readonly number[];
  altitude: readonly number[];
  velocity: readonly number[];
  mach?: readonly (number | null)[];
  /** Any further series the run carries, the air's `P` and `Vs` among them. */
  [symbol: string]: readonly (number | null)[] | undefined;
}

/**
 * The sample of a flight with the smallest flutter margin. Not simply the top
 * speed: the air thins on the way up, which raises the flutter speed, so a
 * slower point lower down can be the closer one. Null when no sample moves
 * faster than 1 m/s.
 *
 * Each sample is read in the air the run flew through: the pressure (`P`) and
 * speed of sound (`Vs`) the kernel recorded there, whatever atmosphere the
 * simulation used (standard, the site's own values, a forecast), and the
 * airspeed from the recorded Mach number, so a headwind or tailwind counts. A
 * sample without them (a stored result that does not carry the air) falls back
 * to the standard atmosphere at the site's elevation plus the flight's
 * altitude, and to the speed over the ground.
 */
export function worstFlutterPoint(
  fin: FlutterFin,
  shearModulusPa: number,
  series: FlutterSeries,
  siteAltitudeM: number,
): FlutterPoint | null {
  const pressure = series['P'];
  const sound = series['Vs'];
  let worst: FlutterPoint | null = null;
  for (let i = 0; i < series.time.length; i++) {
    const altitudeM = series.altitude[i] ?? NaN;
    if (!Number.isFinite(altitudeM)) continue;
    const p = pressure?.[i];
    const a = sound?.[i];
    const mach = series.mach?.[i];
    const recorded = p != null && p > 0 && a != null && a > 0 && mach != null && Number.isFinite(mach);
    let air: { p: number; a: number; speedMs: number };
    if (recorded) {
      air = { p, a, speedMs: Math.abs(mach) * a };
    } else {
      const { t, p: pIsa } = isaAt(siteAltitudeM + altitudeM);
      air = { p: pIsa, a: Math.sqrt(GAMMA * R_AIR * t), speedMs: Math.abs(series.velocity[i] ?? NaN) };
    }
    if (!(air.speedMs > 1)) continue;
    const m = flutterMach(fin, shearModulusPa, air.p);
    if (m == null) return null;
    const flutterMs = m * air.a;
    const ratio = flutterMs / air.speedMs;
    if (!worst || ratio < worst.ratio) {
      worst = { time: series.time[i]!, speedMs: air.speedMs, altitudeM, flutterMs, ratio };
    }
  }
  return worst;
}

/** A fin set the flight comes too close to fluttering, and where. */
export interface FlutterFinding {
  nodeId: string;
  /** The fin set's name as the design gives it; empty when it has none. */
  name: string;
  point: FlutterPoint;
  verdict: Exclude<FlutterVerdict, 'ok'>;
}

/**
 * Every planar fin set in `tree` whose margin over `series` is under
 * {@link FLUTTER_MARGIN}, worst first. `shearModulusOf` gives each fin set's
 * modulus, or null for one with no figure, which is left out rather than
 * guessed at.
 */
export function flutterFindings(
  tree: RocketTree,
  series: FlutterSeries,
  siteAltitudeM: number,
  shearModulusOf: (node: ComponentNode) => number | null,
): FlutterFinding[] {
  const out: FlutterFinding[] = [];
  for (const node of walkNodes(tree.components)) {
    if (!node.id || !isPlanarFinSet(node.type)) continue;
    const shearPa = shearModulusOf(node);
    if (shearPa == null) continue;
    const fin = flutterFin(node, finMountOf(tree, node.id));
    const point = fin ? worstFlutterPoint(fin, shearPa, series, siteAltitudeM) : null;
    if (!point) continue;
    const verdict = flutterVerdict(point.ratio);
    if (verdict === 'ok') continue;
    out.push({ nodeId: node.id, name: typeof node.name === 'string' ? node.name : '', point, verdict });
  }
  return out.sort((a, b) => a.point.ratio - b.point.ratio);
}

/** A fin set with a flat outline: the ones the flutter estimate is for. */
function isPlanarFinSet(type: string): boolean {
  return type === 'trapezoidfinset' || type === 'ellipticalfinset' || type === 'freeformfinset';
}
