import { isaAt } from './recoverySizing';
import { uiToSi } from '../../prefs/units';

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
  const { rootChordM: root, tipChordM: tip, spanM: span, thicknessM: thick } = fin;
  if (!(root > 0) || !(tip >= 0) || !(span > 0) || !(thick > 0) || !(shearModulusPa > 0)) return null;
  const area = ((root + tip) / 2) * span;
  const ar = (span * span) / area;
  const taper = tip / root;
  const tc = thick / root;
  const { t, p } = isaAt(altitudeM);
  const a = Math.sqrt(GAMMA * R_AIR * t);
  const denominator = ((NACA_CONSTANT_PSI * ar ** 3) / (tc ** 3 * (ar + 2))) * ((taper + 1) / 2) * (p / P0);
  const speedMs = a * Math.sqrt(shearModulusPa / PSI / denominator);
  return { speedMs, mach: speedMs / a };
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
