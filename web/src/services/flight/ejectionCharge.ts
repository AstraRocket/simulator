import { uiToSi } from '../../prefs/units';

// m = P V / (R T) with hobby-calculator FFFFg constants R = 22.16 ft.lbf/(lbm.degR), T = 3307 degR.

const FT_LBF = 0.3048 * 4.4482216152605; // J
const LBM = 0.45359237; // kg
/** Rankine to kelvin. */
const RANKINE = 5 / 9;

/** R * T, J/kg. */
const POWDER_RT = ((22.16 * FT_LBF) / (LBM * RANKINE)) * (3307 * RANKINE);

export const DEFAULT_BAY_PRESSURE_PA = uiToSi('pressure', 'psi', 15);

function boreVolume(boreM: number, lengthM: number): number {
  return (Math.PI / 4) * boreM * boreM * lengthM;
}

/** kg of powder for `pressurePa` above ambient. */
export function blackPowderMass(pressurePa: number, boreM: number, lengthM: number): number | null {
  if (!(pressurePa > 0) || !(boreM > 0) || !(lengthM > 0)) return null;
  return (pressurePa * boreVolume(boreM, lengthM)) / POWDER_RT;
}

export function pinShearPressure(pinCount: number, pinForceN: number, boreM: number): number | null {
  if (!(pinCount > 0) || !(pinForceN > 0) || !(boreM > 0)) return null;
  return (pinCount * pinForceN) / ((Math.PI / 4) * boreM * boreM);
}
