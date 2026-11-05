import { driftEllipse, type DriftEllipse } from '../flight/driftEllipse';
import { distanceFromPad, type GroundPoint } from '../flight/groundTrack';
import {
  fetchElevation,
  fetchWeather,
  HOUR_OFFSETS,
  sampleAt,
  sampleAtUnix,
  type FetchOpts,
  type ForecastVariant,
  type WeatherAnswer,
} from '../weather/openMeteo';
import { proposalFor } from '../weather/weatherProposal';
import { descentDrift, type DescentPlan, type DriftResult, type WindLayer } from './descentDrift';
import { fetchTerrain, groundAt, type TerrainGrid } from './terrain';

const SPEED_FACTORS = [0.8, 1, 1.2] as const;
const DIRECTION_OFFSETS_DEG = [-15, 0, 15] as const;
const RATE_FACTORS = [0.9, 1, 1.1] as const;

export function windAt(variant: ForecastVariant, unix: number): WindLayer[] | null {
  const sample = sampleAtUnix(variant, unix);
  if (!sample) return null;
  const levels = proposalFor(sample, variant.elevationM).wind?.levels;
  return levels?.length
    ? levels.map((l) => ({ altitudeM: l.altitudeM, speed: l.speed, fromDeg: l.directionDeg }))
    : null;
}

export interface LandingEstimate {
  nominal: DriftResult;
  samples: GroundPoint[];
  ellipse: DriftEllipse | null;
  hours: number;
}

export function estimateLanding(q: {
  variant: ForecastVariant;
  validUnix: number;
  latitudeDeg: number;
  longitudeDeg: number;
  padElevationM: number;
  plan: DescentPlan;
  groundAt?: (latDeg: number, lonDeg: number) => number;
}): LandingEstimate | null {
  const base = { ...q, plan: q.plan };
  const chosen = windAt(q.variant, q.validUnix);
  if (!chosen) return null;
  const nominal = descentDrift({ ...base, wind: chosen });
  const samples: GroundPoint[] = [];
  let hours = 0;
  for (const dh of HOUR_OFFSETS) {
    const wind = dh === 0 ? chosen : windAt(q.variant, q.validUnix + dh * 3600);
    if (!wind) continue;
    hours++;
    for (const speedFactor of SPEED_FACTORS) {
      for (const directionOffsetDeg of DIRECTION_OFFSETS_DEG) {
        for (const rateFactor of RATE_FACTORS) {
          samples.push(descentDrift({ ...base, wind, speedFactor, directionOffsetDeg, rateFactor }).landing);
        }
      }
    }
  }
  return { nominal, samples, ellipse: driftEllipse(samples), hours };
}

// Re-based to the pad: the terrain model and a surveyed altitude disagree by meters.
function relativeGround(grid: TerrainGrid, latDeg: number, lonDeg: number, padElevationM: number) {
  const g = groundAt(grid);
  const shift = padElevationM - g(latDeg, lonDeg);
  return (lat: number, lon: number) => g(lat, lon) + shift;
}

export interface LandingQuery {
  latitudeDeg: number;
  longitudeDeg: number;
  // Meters above sea level; null to take the terrain model's height.
  padElevationM: number | null;
  date: string;
  hour: number;
  today: string;
  plan: DescentPlan;
  apiKey?: string;
}

export interface LandingRun {
  answer: WeatherAnswer;
  estimate: LandingEstimate;
  padElevationM: number;
  validUnix: number;
  terrain: boolean;
}

const MAX_TERRAIN_HALF_WIDTH_M = 30_000;

// Flies on flat ground first to size the terrain fetch, then again on the terrain.
export async function runLandingEstimate(
  q: LandingQuery,
  o: FetchOpts = {},
): Promise<LandingRun | 'noHour' | 'noElevation'> {
  const padElevationM = q.padElevationM ?? (await fetchElevation(q.latitudeDeg, q.longitudeDeg, q.apiKey, o));
  if (padElevationM == null) return 'noElevation';
  const answer = await fetchWeather(
    {
      latitudeDeg: q.latitudeDeg,
      longitudeDeg: q.longitudeDeg,
      siteM: padElevationM,
      date: q.date,
      today: q.today,
      apiKey: q.apiKey,
    },
    o,
  );
  const variant = answer.variants[0]!;
  const sample = sampleAt(variant, answer.timezone, q.date, q.hour);
  if (!sample) return 'noHour';
  const base = {
    variant,
    validUnix: sample.unix,
    latitudeDeg: q.latitudeDeg,
    longitudeDeg: q.longitudeDeg,
    padElevationM,
    plan: q.plan,
  };
  const flat = estimateLanding(base);
  if (!flat) return 'noHour';

  const reach = Math.max(...flat.samples.map(distanceFromPad), flat.nominal.distanceM);
  const halfWidth = Math.min(MAX_TERRAIN_HALF_WIDTH_M, Math.max(1000, reach * 1.5 + 500));
  let grid: TerrainGrid | null;
  try {
    grid = await fetchTerrain(q.latitudeDeg, q.longitudeDeg, halfWidth, q.apiKey, o);
  } catch (err) {
    if ((err as { kind?: string }).kind === 'aborted') throw err;
    grid = null;
  }
  const estimate =
    (grid
      ? estimateLanding({ ...base, groundAt: relativeGround(grid, q.latitudeDeg, q.longitudeDeg, padElevationM) })
      : null) ?? flat;
  return { answer, estimate, padElevationM, validUnix: sample.unix, terrain: grid !== null };
}
