import { isaAt } from './recoverySizing';
import { uiToSi } from '../../prefs/units';
import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { num, str } from '../../tree/nodeProps';
import { walkNodes } from '../../tree/treeWalk';
import { isPlanarFinSet } from '../../tree/tubefins';
import {
  finMountOf,
  finPlanformArea,
  finPlanformPoints,
  finRootChord,
  finSpan,
  type FinParent,
} from '../../tree/finPlanform';

// NACA TN 4197: the 39.3 constant carries psi, so G is converted to psi and pressure enters only as P / P0.

const GAMMA = 1.4;
/** J/(kg.K), the kernel's own value. */
const R_AIR = 287.053;
/** Pa. */
const P0 = 101325;
const NACA_CONSTANT_PSI = 39.3;
const PSI = uiToSi('pressure', 'psi', 1);

/** Meters. */
export interface FlutterFin {
  rootChordM: number;
  tipChordM: number;
  spanM: number;
  thicknessM: number;
}

export function flutterSpeed(
  fin: FlutterFin,
  shearModulusPa: number,
  altitudeM: number,
): { speedMs: number; mach: number } | null {
  const { t, p } = isaAt(altitudeM);
  return flutterSpeedIn(fin, shearModulusPa, p, Math.sqrt(GAMMA * R_AIR * t));
}

export function flutterSpeedIn(
  fin: FlutterFin,
  shearModulusPa: number,
  pressurePa: number,
  soundMs: number,
): { speedMs: number; mach: number } | null {
  const mach = flutterMach(fin, shearModulusPa, pressurePa);
  return mach == null || !(soundMs > 0) ? null : { speedMs: mach * soundMs, mach };
}

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

export const FLUTTER_MARGIN = 1.25;

export type FlutterVerdict = 'over' | 'marginal' | 'ok';

export function flutterVerdict(ratio: number): FlutterVerdict {
  if (ratio < 1) return 'over';
  if (ratio < FLUTTER_MARGIN) return 'marginal';
  return 'ok';
}

// Keys stay literal so the i18n key scan finds their labels.
export const FIN_MATERIALS = [
  { key: 'g10', shearModulusPa: 425000 * PSI },
  { key: 'plywood', shearModulusPa: 90000 * PSI },
  { key: 'balsa', shearModulusPa: 20000 * PSI },
  { key: 'pla', shearModulusPa: 1.2e9 },
  { key: 'petg', shearModulusPa: 0.77e9 },
  { key: 'aluminum', shearModulusPa: 26e9 },
] as const;

export type FinMaterialKey = (typeof FIN_MATERIALS)[number]['key'];

// Solid birch (not plywood) and carbon fiber (layup-dependent) are deliberately unmatched.
const STOCK_BY_MATERIAL: Readonly<Record<string, FinMaterialKey>> = {
  Fiberglass: 'g10',
  'Plywood (birch)': 'plywood',
  Balsa: 'balsa',
  'PLA - 100% infill': 'pla',
  'PETG - 100% infill': 'petg',
  Aluminum: 'aluminum',
};

export function finStockFor(materialName: unknown): FinMaterialKey | null {
  return typeof materialName === 'string' && Object.hasOwn(STOCK_BY_MATERIAL, materialName)
    ? STOCK_BY_MATERIAL[materialName]!
    : null;
}

// Equivalent trapezoid: same root chord, span and area, so the aspect ratio matches.
export function flutterFin(node: ComponentNode, parent: FinParent = null): FlutterFin | null {
  const pts = finPlanformPoints(node);
  if (!pts) return null;
  const rootChordM = finRootChord(node);
  const spanM = finSpan(node, parent);
  const thicknessM = num(node, 'thickness');
  if (!(rootChordM > 0) || !(spanM > 0) || !(thicknessM > 0)) return null;
  const area = finPlanformArea(pts);
  return { rootChordM, tipChordM: Math.max(0, (2 * area) / spanM - rootChordM), spanM, thicknessM };
}

export interface FlutterPoint {
  time: number;
  /** Airspeed, m/s (ground speed for a run without recorded air). */
  speedMs: number;
  /** Above the launch site, m. */
  altitudeM: number;
  flutterMs: number;
  ratio: number;
}

export interface FlutterSeries {
  time: readonly number[];
  altitude: readonly number[];
  velocity: readonly number[];
  mach?: readonly (number | null)[];
  [symbol: string]: readonly (number | null)[] | undefined;
}

// Not simply top speed: thinner air raises the flutter speed, so a slower, lower point can be closer.
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

export interface FlutterFinding {
  nodeId: string;
  name: string;
  point: FlutterPoint;
  verdict: Exclude<FlutterVerdict, 'ok'>;
}

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
    out.push({ nodeId: node.id, name: str(node, 'name'), point, verdict });
  }
  return out.sort((a, b) => a.point.ratio - b.point.ratio);
}
