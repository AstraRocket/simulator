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
/** `ExtendedISAModel.STANDARD_LAYERS` (geopotential, m) and `STANDARD_TEMPERATURES` (K). */
const ISA_LAYERS = [0, 11000, 20000, 32000, 47000, 51000, 71000, 84852];
const ISA_TEMPS = [288.15, 216.65, 216.65, 228.65, 270.65, 270.65, 214.65, 186.95];

const toGeopotential = (h: number) => (ISA_EARTH_RADIUS_M * h) / (ISA_EARTH_RADIUS_M + h);
const toGeometric = (geo: number) => (ISA_EARTH_RADIUS_M * geo) / (ISA_EARTH_RADIUS_M - geo);

/** `ExtendedISAModel.calculatePressure`: the pressure at `alt1` from the conditions at `alt2`. */
function layerPressure(alt1: number, temp1: number, alt2: number, temp2: number, press2: number): number {
  const rate = (temp2 - temp1) / (alt2 - alt1);
  if (Math.abs(rate) > 0.000001) return press2 / Math.pow(1 + ((alt2 - alt1) * rate) / temp1, -G0 / (rate * R_AIR));
  return press2 / Math.exp((-(alt2 - alt1) * G0) / (R_AIR * temp1));
}

function pressureIn(layer: number, basePressure: number, geo: number): { t: number; p: number } {
  const rate = (ISA_TEMPS[layer + 1]! - ISA_TEMPS[layer]!) / (ISA_LAYERS[layer + 1]! - ISA_LAYERS[layer]!);
  const t = ISA_TEMPS[layer]! + (geo - ISA_LAYERS[layer]!) * rate;
  return { t, p: layerPressure(geo, t, ISA_LAYERS[layer]!, ISA_TEMPS[layer]!, basePressure) };
}

/** Each layer's base pressure, read 1 m below its base as the kernel's constructor does. */
const ISA_PRESSURES = ISA_LAYERS.reduce<number[]>(
  (out, base, i) => [...out, i === 0 ? P0 : pressureIn(i - 1, out[i - 1]!, base - 1).p],
  [],
);

/** `ExtendedISAModel.getExactConditions`; `h` is geometric altitude, m. */
function isaExact(h: number): { t: number; p: number } {
  const geo = Math.min(Math.max(toGeopotential(h), 0), ISA_LAYERS[ISA_LAYERS.length - 1]!);
  let layer = 0;
  while (layer < ISA_LAYERS.length - 2 && ISA_LAYERS[layer + 1]! <= geo) layer++;
  return pressureIn(layer, ISA_PRESSURES[layer]!, geo);
}

/** The kernel's last tabulated level; it holds that level's conditions above it. */
const ISA_TOP_LEVEL = Math.ceil(toGeometric(ISA_LAYERS[ISA_LAYERS.length - 1]!) / ISA_TABLE_STEP) - 1;

// As the kernel's ExtendedISAModel reads them: exact every 500 m, linear in between.
export function isaAt(h: number): { t: number; p: number } {
  if (!(h > 0)) return isaExact(0);
  if (h >= ISA_TOP_LEVEL * ISA_TABLE_STEP) return isaExact(ISA_TOP_LEVEL * ISA_TABLE_STEP);
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

/** Field limits shared by the parachute tool and the simple rocket; SI, the Cd unitless. */
export const CHUTE_LIMITS = {
  diameter: { stepSi: 0.01, minSi: 0.01, maxSi: 20 },
  cd: { step: 0.05, min: 0.05, max: 3 },
} as const;

export type RateVerdict = 'slow' | 'main' | 'between' | 'drogue' | 'fast';

export function classifyRate(rateMs: number): RateVerdict {
  if (rateMs < MAIN_BAND.min) return 'slow';
  if (rateMs <= MAIN_BAND.max) return 'main';
  if (rateMs < DROGUE_BAND.min) return 'between';
  if (rateMs <= DROGUE_BAND.max) return 'drogue';
  return 'fast';
}
