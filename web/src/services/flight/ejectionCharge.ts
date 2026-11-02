import { uiToSi } from '../../prefs/units';

/**
 * Black powder ejection charges: how much powder pressurizes a recovery bay
 * enough to push the airframe apart.
 *
 * The charge is the ideal gas law solved for the mass of powder gas that fills
 * the bay at the target pressure,
 *
 *     m = P V / (R T)
 *
 * with the combustion gas constant and flame temperature hobby charge
 * calculators use for FFFFg powder, R = 22.16 ft.lbf/(lbm.degR) and
 * T = 3307 degR. For a bay D inches across and L long at P psi that is about
 * 0.0004 D^2 L P grams, the "0.006 D^2 L" rule of thumb at 15 psi.
 *
 * It ignores heat lost to the airframe, powder that burns late or not at all,
 * gas escaping past the coupler, and the bay's wadding and recovery gear taking
 * up volume, which is why a ground test is the answer and this is where it
 * starts.
 */

const FT_LBF = 0.3048 * 4.4482216152605; // J
const LBM = 0.45359237; // kg
/** Rankine to kelvin. */
const RANKINE = 5 / 9;

/** The powder gas's specific gas constant times its flame temperature, J/kg. */
const POWDER_RT = ((22.16 * FT_LBF) / (LBM * RANKINE)) * (3307 * RANKINE);

/** The target pressure hobby practice starts from, 15 psi. */
export const DEFAULT_BAY_PRESSURE_PA = uiToSi('pressure', 'psi', 15);

/** A cylinder's volume, m^3, from its inside diameter and length. */
function boreVolume(boreM: number, lengthM: number): number {
  return (Math.PI / 4) * boreM * boreM * lengthM;
}

/**
 * Black powder (kg) that brings a bay `boreM` across and `lengthM` long to
 * `pressurePa` above the outside air; null unless all three are positive.
 */
export function blackPowderMass(pressurePa: number, boreM: number, lengthM: number): number | null {
  if (!(pressurePa > 0) || !(boreM > 0) || !(lengthM > 0)) return null;
  return (pressurePa * boreVolume(boreM, lengthM)) / POWDER_RT;
}

/**
 * The bay pressure (Pa) that shears `pinCount` pins of `pinForceN` each: their
 * total strength spread over the bulkhead the gas pushes on, the bay's bore.
 * Null unless all three are positive.
 */
export function pinShearPressure(pinCount: number, pinForceN: number, boreM: number): number | null {
  if (!(pinCount > 0) || !(pinForceN > 0) || !(boreM > 0)) return null;
  return (pinCount * pinForceN) / ((Math.PI / 4) * boreM * boreM);
}
