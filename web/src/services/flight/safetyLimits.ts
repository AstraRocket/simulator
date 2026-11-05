import type { LaunchConditions } from '../design/orkTree';
import { surfaceWind } from './windLevels';
import { fmtUpTo, ladderDigits, withUnit } from '../../i18n/format';
import { degToRad, type Quantity, siToUi, uiToSi, unitScope, type UnitSymbols } from '../../prefs/units';
import { LIMIT_FIELD } from '../../prefs/launchUnits';
import type { PowerClass } from './powerClass';
import type { LauncherKind } from '../design/launcher';
import { keyedText, type Keyed } from '../../i18n/keyedError';

// NAR and Tripoli safety code limits; the codes state imperial figures, so metric values are exact conversions.

// Degrees from vertical.
export const MAX_ROD_ANGLE_DEG: Record<PowerClass, number> = { model: 30, highPower: 20 };

const MAX_WIND_SPEED_MPH = 20;

const MPH_TO_MS = uiToSi('windspeed', 'mph', 1);

export const MAX_ROD_ANGLE_RAD: Record<PowerClass, number> = {
  model: degToRad(MAX_ROD_ANGLE_DEG.model),
  highPower: degToRad(MAX_ROD_ANGLE_DEG.highPower),
};
export const MAX_WIND_SPEED_MS = MAX_WIND_SPEED_MPH * MPH_TO_MS;

// A field ceiling, not a code limit.
export const MAX_TURBULENCE_PERCENT = 100;

export interface LimitViolation {
  field: 'rodAngle' | 'windSpeed';
  // SI: radians for rodAngle, m/s for windSpeed; `limit` likewise.
  value: number;
  limit: number;
  powerClass: PowerClass;
}

function surfaceWindMs(launch: LaunchConditions): number {
  return surfaceWind(launch).speedMs;
}

// Only the pad wind is judged; the codes say nothing about winds aloft or gusts.
export function launchLimitViolations(launch: LaunchConditions, cls: PowerClass): LimitViolation[] {
  const out: LimitViolation[] = [];

  const angle = Math.abs(launch.launchRodAngleDeg ?? 0);
  if (angle > MAX_ROD_ANGLE_DEG[cls]) {
    out.push({ field: 'rodAngle', value: degToRad(angle), limit: MAX_ROD_ANGLE_RAD[cls], powerClass: cls });
  }

  const wind = surfaceWindMs(launch);
  if (wind > MAX_WIND_SPEED_MS) {
    out.push({ field: 'windSpeed', value: wind, limit: MAX_WIND_SPEED_MS, powerClass: cls });
  }

  return out;
}

// Pass `launcher` only when `t` does not already carry it as i18next context.
export function limitNote(v: LimitViolation, u: UnitSymbols, launcher: LauncherKind | null = null): Keyed {
  const quantity: Quantity = v.field === 'rodAngle' ? 'angle' : 'windspeed';
  const sym = u.sym(quantity, unitScope('launch', LIMIT_FIELD[v.field]));
  const ui = (si: number) => siToUi(quantity, sym, si);
  const digits = ladderDigits(Math.max(Math.abs(ui(v.value)), Math.abs(ui(v.limit))));
  const show = (si: number) => withUnit(fmtUpTo(ui(si), digits), sym);
  const key =
    v.field === 'windSpeed'
      ? 'limits.wind'
      : v.powerClass === 'model'
        ? 'limits.rodAngleModel'
        : 'limits.rodAngleHighPower';
  return {
    key: launcher && v.field === 'rodAngle' ? `${key}_${launcher}` : key,
    values: { value: show(v.value), limit: show(v.limit) },
  };
}

export function limitText(
  v: LimitViolation,
  t: (key: string, vars: Record<string, unknown>) => string,
  u: UnitSymbols,
): string {
  return keyedText(limitNote(v, u), (key, values) => t(key, values ?? {}));
}
