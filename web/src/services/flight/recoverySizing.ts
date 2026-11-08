import { LAUNCH_SI } from '../../prefs/launchUnits';
import { siToUi, uiToSi } from '../../prefs/units';
import { G0 } from '../motors/motorMath';
import type { AtmosphereLevel } from '../design/orkTree';
import { usableAtmosphereLevels } from './atmosphereLevels';
import { ISA_EARTH_RADIUS_M } from '../map/geodesy';

const FT_S = uiToSi('velocity', 'ft/s', 1);

/** Dry air, J/(kg.K), the kernel's own value. */
const R_AIR = 287.053;

const T0 = 288.15; // K
const P0 = 101325; // Pa
const RHO0 = 1.225; // kg/m^3
const LAPSE = 0.0065; // K/m (positive)

export interface SizingLaunch {
  launchAltitudeM?: number | null;
  temperatureC?: number | null;
  pressureHPa?: number | null;
  /** Fraction. Read only to pick the flight's atmosphere branch; density here is dry-air. */
  relativeHumidity?: number | null;
  atmosphereLevels?: readonly AtmosphereLevel[];
}

// kg/m^3. Mirrors the bridge's three branches (`api/OpenRocketEngine.simulateJson`).
export function airDensity(launch?: SizingLaunch | null): number {
  if (!launch) return RHO0;
  const h = launch.launchAltitudeM ?? 0;
  const anchored = launch.temperatureC != null && launch.pressureHPa != null;
  const levels = launch.atmosphereLevels?.length ? usableAtmosphereLevels(launch.atmosphereLevels) : [];
  if (levels.length && !anchored) return profileDensity(levels, h);
  const { t, p } = siteAtmosphere(launch);
  if (!(t > 0) || !(p > 0)) return RHO0;
  return p / (R_AIR * t);
}

export function siteAtmosphere(launch: SizingLaunch): { t: number; p: number; standard: boolean } {
  const custom = launch.temperatureC != null || launch.pressureHPa != null || launch.relativeHumidity != null;
  const { t: tIsa, p: pIsa } = isaAt(launch.launchAltitudeM ?? 0);
  // A blank in the custom branch takes the sea-level ExtendedISAModel.STANDARD_*, not ISA at altitude.
  const t = launch.temperatureC != null ? LAUNCH_SI.degC.toSi(launch.temperatureC) : custom ? T0 : tIsa;
  const p = launch.pressureHPa != null ? LAUNCH_SI.hPa.toSi(launch.pressureHPa) : custom ? P0 : pIsa;
  return { t, p, standard: !custom };
}

// kg/m^3. ISA pressure at the site, unlike airDensity, which follows the flight's sea-level fill.
export function siteAirDensity(siteM: number | null, temperatureC: number | null): number {
  const { t: tIsa, p } = isaAt(siteM ?? 0);
  const t = temperatureC != null ? LAUNCH_SI.degC.toSi(temperatureC) : tIsa;
  if (!(t > 0) || !(p > 0)) return RHO0;
  return p / (R_AIR * t);
}

const ISA_TABLE_STEP = 500;
/** Geopotential, m. */
const H_TROPOPAUSE = 11000;
const T_TROPOPAUSE = T0 - LAPSE * H_TROPOPAUSE;
const P_TROPOPAUSE = P0 * Math.pow(T_TROPOPAUSE / T0, G0 / (R_AIR * LAPSE));

/** `h` is geometric altitude, m. */
function isaExact(h: number): { t: number; p: number } {
  const geo = Math.min((ISA_EARTH_RADIUS_M * h) / (ISA_EARTH_RADIUS_M + h), 20000);
  if (geo < H_TROPOPAUSE) {
    const t = T0 - LAPSE * geo;
    return { t, p: P0 * Math.pow(t / T0, G0 / (R_AIR * LAPSE)) };
  }
  return { t: T_TROPOPAUSE, p: P_TROPOPAUSE * Math.exp((-(geo - H_TROPOPAUSE) * G0) / (R_AIR * T_TROPOPAUSE)) };
}

// As the kernel's ExtendedISAModel reads them: exact every 500 m, linear in between.
export function isaAt(h: number): { t: number; p: number } {
  if (!(h > 0)) return isaExact(0);
  const i = Math.floor(h / ISA_TABLE_STEP);
  const f = (h - i * ISA_TABLE_STEP) / ISA_TABLE_STEP;
  const lo = isaExact(i * ISA_TABLE_STEP);
  const hi = isaExact((i + 1) * ISA_TABLE_STEP);
  return { t: lo.t + (hi.t - lo.t) * f, p: lo.p + (hi.p - lo.p) * f };
}

// Mirrors `AtmosphereProfile.getConditions`: pressure log-linear between levels.
function profileDensity(levels: readonly AtmosphereLevel[], h: number): number {
  const tK = (l: AtmosphereLevel) => LAUNCH_SI.degC.toSi(l.temperatureC);
  const pPa = (l: AtmosphereLevel) => LAUNCH_SI.hPa.toSi(l.pressureHPa);
  const first = levels[0]!;
  const last = levels[levels.length - 1]!;
  let t: number;
  let p: number;
  const outside = h <= first.altitudeM ? first : h >= last.altitudeM ? last : null;
  if (outside) {
    const atLevel = isaAt(outside.altitudeM);
    const atH = isaAt(h);
    t = tK(outside) + (atH.t - atLevel.t);
    p = pPa(outside) * (atH.p / atLevel.p);
  } else {
    let i = 0;
    while (levels[i + 1]!.altitudeM < h) i++;
    const lo = levels[i]!;
    const hi = levels[i + 1]!;
    const f = (h - lo.altitudeM) / (hi.altitudeM - lo.altitudeM);
    t = tK(lo) + (tK(hi) - tK(lo)) * f;
    p = Math.exp(Math.log(pPa(lo)) + (Math.log(pPa(hi)) - Math.log(pPa(lo))) * f);
  }
  return t > 0 && p > 0 ? p / (R_AIR * t) : RHO0;
}

export function propellantMass(m: { masses?: number[] } | null | undefined): number {
  const ms = m?.masses;
  return ms && ms.length ? Math.max(0, ms[0]! - ms[ms.length - 1]!) : 0;
}

export function descentMass(
  loadedMassKg: number | null | undefined,
  motors: Array<{ masses?: number[] } | null | undefined>,
): number | null {
  if (loadedMassKg == null) return null;
  let propellant = 0;
  for (const m of motors) propellant += propellantMass(m);
  if (propellant <= 0) return null;
  // Propellant over loaded mass is bad motor data; a negative mass would NaN downstream.
  const dm = loadedMassKg - propellant;
  return dm > 0 ? dm : null;
}

/** m/s. */
export function descentRate(massKg: number, diameterM: number, cd: number, rho: number): number {
  const area = (Math.PI * diameterM * diameterM) / 4;
  if (!(massKg > 0) || !(area > 0) || !(cd > 0) || !(rho > 0)) return Infinity;
  return Math.sqrt((2 * massKg * G0) / (rho * cd * area));
}

/** m. */
export function canopyDiameter(massKg: number, rateMs: number, cd: number, rho: number): number {
  if (!(massKg > 0) || !(rateMs > 0) || !(cd > 0) || !(rho > 0)) return Infinity;
  const area = (2 * massKg * G0) / (rho * cd * rateMs * rateMs);
  return Math.sqrt((4 * area) / Math.PI);
}

const CANOPY_STEP: Record<string, number> = { mm: 10, cm: 1, m: 0.01, in: 1, ft: 0.1 };

// Up, not nearest, so the canopy lands a little slower than the target, never faster.
export function canopyRoundUp(diameterM: number, sym: string): number {
  const step = CANOPY_STEP[sym];
  if (step == null || !Number.isFinite(diameterM) || !(diameterM > 0)) return diameterM;
  // The nudge keeps a size already on a step (from float noise) where it is.
  return uiToSi('length', sym, Math.ceil(siToUi('length', sym, diameterM) / step - 1e-9) * step);
}

/** All m/s. */
export interface Band {
  key: 'main' | 'drogue';
  min: number;
  max: number;
  target: number;
}

export const MAIN_BAND: Band = { key: 'main', min: 15 * FT_S, max: 20 * FT_S, target: 18 * FT_S };

export const DROGUE_BAND: Band = { key: 'drogue', min: 50 * FT_S, max: 75 * FT_S, target: 60 * FT_S };

export type RateVerdict = 'slow' | 'main' | 'between' | 'drogue' | 'fast';

export function classifyRate(rateMs: number): RateVerdict {
  if (rateMs < MAIN_BAND.min) return 'slow';
  if (rateMs <= MAIN_BAND.max) return 'main';
  if (rateMs < DROGUE_BAND.min) return 'between';
  if (rateMs <= DROGUE_BAND.max) return 'drogue';
  return 'fast';
}
