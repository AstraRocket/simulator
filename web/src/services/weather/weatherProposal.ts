import type { AtmosphereLevel, LaunchConditions, WindLevel } from '../design/orkTree';
import { usableAtmosphereLevels } from '../flight/atmosphereLevels';
import { usableWindLevels } from '../flight/windLevels';
import type { HourSample } from './openMeteo';
import { roundTo } from '../app/numbers';
import { stdDevForIntensity } from '../flight/windTurbulence';

// Mirrors desktop OpenRocket's current-conditions client: all winds become MSL wind levels.

export const UPPER_AIR_TURBULENCE = 0.1;

/** Desktop OpenRocket's `estimateTurbulenceIntensity`. */
export function turbulenceFromGust(speed: number, gust: number | null): number {
  if (speed <= 0.1 || gust === null || gust <= speed) return 0.1;
  return Math.max(0.05, Math.min(0.35, (gust - speed) / (3 * speed)));
}

export interface WeatherProposal {
  temperatureC?: number;
  pressureHPa?: number;
  /** A fraction, 0..1. */
  relativeHumidity?: number;
  wind?: {
    surfaceSpeed: number;
    surfaceFromDeg: number;
    surfaceStdDev: number;
    gust: number | null;
    levels: WindLevel[];
  };
  atmosphere?: AtmosphereLevel[];
}

export type ProposalGroup = 'temperature' | 'pressure' | 'humidity' | 'wind' | 'atmosphere';

export const PROPOSAL_GROUPS: readonly ProposalGroup[] = ['temperature', 'pressure', 'humidity', 'wind', 'atmosphere'];

export function hasGroup(p: WeatherProposal, group: ProposalGroup): boolean {
  switch (group) {
    case 'temperature':
      return p.temperatureC !== undefined;
    case 'pressure':
      return p.pressureHPa !== undefined;
    case 'humidity':
      return p.relativeHumidity !== undefined;
    case 'wind':
      return p.wind !== undefined;
    case 'atmosphere':
      return (p.atmosphere?.length ?? 0) > 0;
  }
}

const humidityFraction = (pct: number): number => Math.min(1, Math.max(0, pct / 100));

/** `elevationM` is meters MSL. */
export function proposalFor(s: HourSample, elevationM: number): WeatherProposal {
  const p: WeatherProposal = {};
  if (s.temperatureC !== null) p.temperatureC = s.temperatureC;
  if (s.pressureHPa !== null && s.pressureHPa > 0) p.pressureHPa = s.pressureHPa;
  if (s.humidityPct !== null) p.relativeHumidity = humidityFraction(s.humidityPct);

  if (s.windSpeed !== null && s.windFromDeg !== null) {
    const surfaceTi = turbulenceFromGust(s.windSpeed, s.windGust);
    const raw: WindLevel[] = [
      {
        altitudeM: elevationM + 10,
        speed: s.windSpeed,
        directionDeg: s.windFromDeg,
        stddev: stdDevForIntensity(s.windSpeed, surfaceTi),
      },
    ];
    for (const h of s.heightWinds) {
      if (h.speed !== null && h.speed >= 0 && h.fromDeg !== null) {
        raw.push({
          altitudeM: elevationM + h.heightM,
          speed: h.speed,
          directionDeg: h.fromDeg,
          stddev: stdDevForIntensity(h.speed, UPPER_AIR_TURBULENCE),
        });
      }
    }
    // Pressure levels below the highest height wind are extrapolation into the ground layer.
    const top = Math.max(...raw.map((l) => l.altitudeM));
    for (const l of s.levels) {
      if (
        l.altitudeM !== null &&
        l.altitudeM > top &&
        l.windSpeed !== null &&
        l.windSpeed >= 0 &&
        l.windFromDeg !== null
      ) {
        raw.push({
          altitudeM: l.altitudeM,
          speed: l.windSpeed,
          directionDeg: l.windFromDeg,
          stddev: stdDevForIntensity(l.windSpeed, UPPER_AIR_TURBULENCE),
        });
      }
    }
    raw.sort((a, b) => a.altitudeM - b.altitudeM);
    p.wind = {
      surfaceSpeed: s.windSpeed,
      surfaceFromDeg: s.windFromDeg,
      surfaceStdDev: stdDevForIntensity(s.windSpeed, surfaceTi),
      gust: s.windGust,
      levels: usableWindLevels(raw),
    };
  }

  // A level at or below the pad, by height or pressure, is extrapolation into the ground.
  const surfaceHPa = p.pressureHPa;
  const atmosphere = usableAtmosphereLevels(
    s.levels
      .filter((l) => l.altitudeM !== null && l.altitudeM > elevationM)
      .filter((l) => surfaceHPa === undefined || l.pressureHPa < surfaceHPa)
      .map((l) => ({
        altitudeM: l.altitudeM,
        temperatureC: l.temperatureC,
        pressureHPa: l.pressureHPa,
        relativeHumidity: l.humidityPct === null ? null : humidityFraction(l.humidityPct),
      })),
  );
  if (atmosphere.length) p.atmosphere = atmosphere;
  return p;
}

export function proposalPatch(
  p: WeatherProposal,
  ticked: ReadonlySet<ProposalGroup>,
  elevation?: { launchAltitudeM: number },
): Partial<LaunchConditions> {
  const out: Partial<LaunchConditions> = {};
  if (ticked.has('temperature') && p.temperatureC !== undefined) out.temperatureC = roundTo(p.temperatureC, 1);
  if (ticked.has('pressure') && p.pressureHPa !== undefined) out.pressureHPa = roundTo(p.pressureHPa, 1);
  if (ticked.has('humidity') && p.relativeHumidity !== undefined) out.relativeHumidity = roundTo(p.relativeHumidity, 2);
  if (ticked.has('wind') && p.wind) {
    out.windAverage = roundTo(p.wind.surfaceSpeed, 2);
    out.windStdDev = roundTo(p.wind.surfaceStdDev, 2);
    out.windDirectionDeg = roundTo(p.wind.surfaceFromDeg, 0);
    out.windLevels = p.wind.levels;
    out.windAltitudeReference = 'msl';
  }
  if (ticked.has('atmosphere') && p.atmosphere?.length) out.atmosphereLevels = p.atmosphere;
  if (elevation) out.launchAltitudeM = elevation.launchAltitudeM;
  return out;
}
