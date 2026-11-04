import type { FlightResult, FlightSeries } from '../../engine/openRocketEngine';
import { lerpAt } from './interpolate';
import { flightBranches } from './flightColumns';

// Synthetic: not a kernel `FlightEvent.Type`, spelled like one so the table treats it alike.
export const MAX_Q = 'MAX_Q';

// Absent types are dropped: diagnostics reach the user via FlightWarnings; ALTITUDE is an internal deploy trigger.
export const EVENT_NAME: Record<string, string> = {
  LAUNCH: 'flightEvent.launch',
  IGNITION: 'flightEvent.ignition',
  LIFTOFF: 'flightEvent.liftoff',
  LAUNCHROD: 'flightEvent.railDeparture',
  [MAX_Q]: 'flightEvent.maxQ',
  BURNOUT: 'flightEvent.burnout',
  EJECTION_CHARGE: 'flightEvent.ejection',
  STAGE_SEPARATION: 'flightEvent.separation',
  APOGEE: 'flightEvent.apogee',
  RECOVERY_DEVICE_DEPLOYMENT: 'flightEvent.deploy',
  TUMBLE: 'flightEvent.tumble',
  GROUND_HIT: 'flightEvent.landing',
  SIMULATION_END: 'flightEvent.simEnd',
};

export type ExtraKey = 'stability' | 'twr' | 'aoa' | 'mach' | 'q';

export const EVENT_EXTRAS: Record<string, readonly ExtraKey[]> = {
  LAUNCHROD: ['stability', 'twr', 'aoa'],
  [MAX_Q]: ['q', 'mach'],
  BURNOUT: ['mach'],
};

export interface EventRow {
  /** Includes the row position: clustered motors burn out at the same instant (BasicEventSimulationEngine:510). */
  key: string;
  type: string;
  time: number;
  /** 0 is the sustainer stack. */
  branch: number;
  branchName: string;
  source?: string;
  /** SI. */
  altitude: number | null;
  velocity: number | null;
  stability: number | null;
  twr: number | null;
  /** Radians. */
  aoa: number | null;
  mach: number | null;
  /** Pa. */
  q: number | null;
}

export interface MaxQPoint {
  time: number;
  /** Pa. */
  q: number;
  altitude: number | null;
  mach: number | null;
  /** True airspeed (m/s), not ground speed. */
  velocity: number;
}

export function seriesAt(series: FlightSeries, key: string, t: number): number | null {
  const ys = series[key];
  if (!Array.isArray(ys) || !Array.isArray(series.time)) return null;
  return lerpAt(series.time, ys, t);
}

// Pa. v is `mach * Vs` (airspeed, AbstractSimulationStepper:460), not `velocity`, which is ground speed.
export function dynamicPressure(series: FlightSeries | undefined): (number | null)[] | null {
  if (!series) return null;
  const rho = series['ρ'];
  const vs = series.Vs;
  const mach = series.mach;
  if (!Array.isArray(rho) || !Array.isArray(vs) || !Array.isArray(mach)) return null;
  return series.time.map((_, i) => {
    const r = rho[i];
    const s = vs[i];
    const m = mach[i];
    if (r == null || s == null || m == null) return null;
    const v = m * s;
    const q = 0.5 * r * v * v;
    return Number.isFinite(q) ? q : null;
  });
}

// Not the ejection charge: a booster's charge lands in the sustainer branch before separation.
export function forwardFlightEnd(result: {
  events: readonly { type: string; time: number }[];
  summary?: { timeToApogee?: number };
}): number {
  return (
    result.events.find((e) => e.type === 'RECOVERY_DEVICE_DEPLOYMENT')?.time ??
    result.events.find((e) => e.type === 'APOGEE')?.time ??
    result.summary?.timeToApogee ??
    Infinity
  );
}

/** Pa·rad. */
export function qAlpha(series: FlightSeries | undefined): (number | null)[] | null {
  const qs = dynamicPressure(series);
  if (!qs || !series) return null;
  return qs.map((q, i) => {
    const a = series.aoa[i];
    return q == null || a == null ? null : q * Math.abs(a);
  });
}

// Up to `untilT` only: under recovery, α reads near 90 degrees and q·α is meaningless.
export function maxQAlpha(series: FlightSeries | undefined, untilT: number): { time: number; value: number } | null {
  const qa = qAlpha(series);
  if (!qa || !series) return null;
  let best: { time: number; value: number } | null = null;
  for (let i = 0; i < qa.length; i++) {
    const v = qa[i];
    const t = series.time[i];
    if (v == null || t == null || t > untilT) continue;
    if (!best || v > best.value) best = { time: t, value: v };
  }
  return best;
}

/** rad/s. */
export function rollRate(series: FlightSeries | undefined): (number | null)[] | null {
  const r = series?.['dΦ'];
  return Array.isArray(r) ? r : null;
}

export function maxRollRate(series: FlightSeries | undefined): number | null {
  const r = rollRate(series);
  if (!r) return null;
  let best: number | null = null;
  for (const v of r) if (v != null && Number.isFinite(v) && (best == null || Math.abs(v) > best)) best = Math.abs(v);
  return best;
}

export function maxQ(series: FlightSeries | undefined): MaxQPoint | null {
  const qs = dynamicPressure(series);
  if (!qs || !series) return null;
  let best = -1;
  let bi = -1;
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    if (q != null && q > best) {
      best = q;
      bi = i;
    }
  }
  if (bi < 0) return null;
  const mach = series.mach[bi] ?? null;
  const vs = series.Vs?.[bi] ?? null;
  return {
    time: series.time[bi]!,
    q: best,
    altitude: series.altitude[bi] ?? null,
    mach,
    velocity: mach != null && vs != null ? mach * vs : 0,
  };
}

// The stable sort keeps same-instant events in the kernel's causal order.
export function eventRows(result: FlightResult | null | undefined): EventRow[] {
  if (!result) return [];
  const rows: EventRow[] = [];
  const branches = flightBranches(result);
  // A booster branch copies pre-separation events (FlightDataBranch copy constructor); list those once.
  const eventKey = (e: { type: string; time: number; source?: string }) => `${e.type}|${e.time}|${e.source ?? ''}`;
  const shared = new Set((branches[0]?.events ?? []).map(eventKey));
  branches.forEach((b, i) => {
    const separated =
      i === 0 ? -Infinity : ((b.events ?? []).find((e) => e.type === 'STAGE_SEPARATION')?.time ?? -Infinity);
    const series = b.series;
    const push = (type: string, time: number, source: string | undefined, q: number | null) => {
      rows.push({
        key: `${i}:${type}:${time}:${rows.length}`,
        type,
        time,
        branch: i,
        branchName: b.name ?? '',
        ...(source ? { source } : {}),
        altitude: seriesAt(series, 'altitude', time),
        velocity: seriesAt(series, 'velocity', time),
        stability: seriesAt(series, 'stability', time),
        twr: seriesAt(series, 'Twr', time),
        aoa: seriesAt(series, 'aoa', time),
        mach: seriesAt(series, 'mach', time),
        q,
      });
    };
    for (const e of b.events ?? []) {
      if (!Number.isFinite(e.time) || !EVENT_NAME[e.type]) continue;
      if (i !== 0 && e.time <= separated && shared.has(eventKey(e))) continue;
      push(e.type, e.time, e.source, null);
    }
    if (i !== 0) return;
    const peak = maxQ(series);
    if (peak) push(MAX_Q, peak.time, undefined, peak.q);
  });
  return rows.sort((a, b) => a.time - b.time || a.branch - b.branch);
}
