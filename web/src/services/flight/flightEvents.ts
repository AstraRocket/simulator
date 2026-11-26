import type { FlightEventType, FlightResult, FlightSeries } from '../../engine/openRocketEngine';
import { finiteOr } from '../app/numbers';
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

/** The event's name, with the part's when the flight splits into more than one. */
export function eventLabel(t: (key: string) => string, e: EventRow, bodies: readonly string[]): string {
  const name = t(EVENT_NAME[e.type] ?? e.type);
  return bodies.length > 1 ? `${name} (${bodies[e.branch] ?? e.branchName})` : name;
}

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

/** The first `type` event's time. */
export function eventTime(
  events: readonly { type: string; time: number }[] | undefined,
  type: FlightEventType,
): number | undefined {
  return events?.find((e) => e.type === type)?.time;
}

/** A series read at the first `type` event, or at the last (a cluster's burnouts); null when either is missing. */
export function seriesAtEvent(
  result: Pick<FlightResult, 'events' | 'series'>,
  type: FlightEventType,
  key: string,
  last = false,
): number | null {
  const hits = result.events.filter((e) => e.type === type);
  const t = (last ? hits[hits.length - 1] : hits[0])?.time;
  return t == null ? null : finiteOr(seriesAt(result.series, key, t), null);
}

/** The summary figures a motor guide row reads; the descent ones are null when the flight has none. */
export function summaryFigures(result: FlightResult) {
  const s = result.summary;
  return {
    railExit: s.launchRodVelocity,
    apogee: s.maxAltitude,
    maxVelocity: s.maxVelocity,
    maxAcceleration: s.maxAcceleration,
    maxMach: s.maxMachNumber,
    timeToApogee: s.timeToApogee,
    optimumDelay: finiteOr(s.optimumDelay, null),
    deployVelocity: finiteOr(s.deploymentVelocity, null),
    landingVelocity: finiteOr(s.groundHitVelocity, null),
  };
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
    eventTime(result.events, 'RECOVERY_DEVICE_DEPLOYMENT') ??
    eventTime(result.events, 'APOGEE') ??
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

/** Where roll rate and pitch natural frequency come close enough for roll and pitch to couple. */
export const RESONANCE_BAND = { lo: 0.85, hi: 1.15, mark: 1 } as const;

/**
 * |roll rate| ÷ pitch natural frequency, both rad/s, so unitless. Null where the kernel leaves ωn blank
 * (on the launch guide, and wherever CP is ahead of CG) or either is missing.
 */
export function rollPitchRatio(series: FlightSeries | undefined): (number | null)[] | null {
  const roll = rollRate(series);
  const wn = series?.['ωn'];
  if (!roll || !Array.isArray(wn)) return null;
  return roll.map((r, i) => {
    const w = wn[i];
    if (r == null || w == null || !(w > 0)) return null;
    const v = Math.abs(r) / w;
    return Number.isFinite(v) ? v : null;
  });
}

export interface ResonanceFigures {
  /** Times the ratio crossed 1, interpolated between recorded points. */
  crossings: number[];
  /** Seconds the ratio spent inside the band. */
  inBand: number;
}

/**
 * The ratio's crossings of 1 and its time in the band, up to `untilT`. Interpolates between recorded points,
 * never across a gap. Null when the ratio has fewer than two points to go on.
 */
export function resonanceFigures(series: FlightSeries | undefined, untilT: number): ResonanceFigures | null {
  const ratio = rollPitchRatio(series);
  if (!ratio || !series) return null;
  const { lo, hi, mark } = RESONANCE_BAND;
  const crossings: number[] = [];
  let inBand = 0;
  let segments = 0;
  for (let i = 1; i < ratio.length; i++) {
    const r0 = ratio[i - 1];
    const r1 = ratio[i];
    const t0 = series.time[i - 1];
    const t1 = series.time[i];
    if (r0 == null || r1 == null || t0 == null || t1 == null || !(t1 > t0) || t0 >= untilT) continue;
    // A segment that runs past the limit is cut there.
    const end = Math.min(t1, untilT);
    const rEnd = r0 + ((r1 - r0) * (end - t0)) / (t1 - t0);
    segments++;
    if ((r0 - mark) * (rEnd - mark) < 0 || (rEnd === mark && r0 !== mark)) {
      crossings.push(t0 + ((mark - r0) / (rEnd - r0)) * (end - t0));
    }
    // The share of a straight segment between lo and hi.
    const dr = rEnd - r0;
    let s0 = 0;
    let s1 = 1;
    if (dr === 0) {
      if (r0 < lo || r0 > hi) continue;
    } else {
      const a = (lo - r0) / dr;
      const b = (hi - r0) / dr;
      s0 = Math.max(0, Math.min(a, b));
      s1 = Math.min(1, Math.max(a, b));
    }
    if (s1 > s0) inBand += (s1 - s0) * (end - t0);
  }
  return segments ? { crossings, inBand } : null;
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
    const separated = i === 0 ? -Infinity : (eventTime(b.events, 'STAGE_SEPARATION') ?? -Infinity);
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
