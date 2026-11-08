import type { FlightSeries } from '../../engine/openRocketEngine';

// Ascent and descent stay separate: turbulent wind differs between the two passes through each altitude.

export interface ProfilePoint {
  /** Meters above the pad. */
  altitude: number;
  value: number;
}

export interface ProfileLegs {
  ascent: ProfilePoint[];
  descent: ProfilePoint[];
}

export type EnvironmentQuantity =
  'windSpeed' | 'windDirection' | 'temperature' | 'pressure' | 'density' | 'speedOfSound';

/** Kernel series symbols (FlightDataType.getSymbol()). */
const SERIES_KEY: Record<EnvironmentQuantity, string> = {
  windSpeed: 'Vw',
  windDirection: 'θw',
  temperature: 'T',
  pressure: 'P',
  density: 'ρ',
  speedOfSound: 'Vs',
};

export interface EnvironmentProfile {
  pad: Record<EnvironmentQuantity, number>;
  /** Meters above the pad. */
  apogee: number;
  profiles: Record<EnvironmentQuantity, ProfileLegs>;
}

export const MAX_POINTS_PER_LEG = 400;

export function environmentProfile(series: FlightSeries): EnvironmentProfile | null {
  const s = series as unknown as Record<string, readonly number[] | undefined>;
  const altitude = s['altitude'];
  if (!altitude?.length) return null;
  const columns = {} as Record<EnvironmentQuantity, readonly number[]>;
  for (const [q, key] of Object.entries(SERIES_KEY) as [EnvironmentQuantity, string][]) {
    const col = s[key];
    if (!col || col.length !== altitude.length) return null;
    columns[q] = col;
  }

  let top = 0;
  for (let i = 1; i < altitude.length; i++) if (altitude[i]! > altitude[top]!) top = i;

  const leg = (from: number, to: number, col: readonly number[]): ProfilePoint[] => {
    const n = to - from;
    const step = Math.max(1, Math.ceil(n / MAX_POINTS_PER_LEG));
    const out: ProfilePoint[] = [];
    for (let i = from; i < to; i += step) push(out, altitude[i]!, col[i]!);
    // Always end on the leg's last sample, so apogee is never thinned away.
    if (n > 0 && (n - 1) % step !== 0) push(out, altitude[to - 1]!, col[to - 1]!);
    return out;
  };

  const profiles = {} as Record<EnvironmentQuantity, ProfileLegs>;
  const pad = {} as Record<EnvironmentQuantity, number>;
  for (const q of Object.keys(SERIES_KEY) as EnvironmentQuantity[]) {
    const col = columns[q];
    profiles[q] = { ascent: leg(0, top + 1, col), descent: leg(top, altitude.length, col) };
    pad[q] = col[0]!;
  }
  return { pad, apogee: altitude[top]!, profiles };
}

// A NaN in a recorded series is a gap, not a value.
function push(out: ProfilePoint[], altitude: number, value: number): void {
  if (Number.isFinite(altitude) && Number.isFinite(value)) out.push({ altitude, value });
}
