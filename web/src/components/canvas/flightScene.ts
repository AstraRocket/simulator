import * as THREE from 'three';
import type { FlightEvent, FlightResult } from '../../engine/openRocketEngine';
import { flightBranches } from '../../services/flight/flightColumns';
import { eventTime, forwardFlightEnd } from '../../services/flight/flightEvents';
import { buildTrack, hasAttitude, trackRows, type FlightTrack } from './flightTrack';

// A burnout with no open burn extends the previous window (cluster motors burning out apart).
export function boostWindows(events: readonly Pick<FlightEvent, 'type' | 'time'>[]): [number, number][] {
  const out: [number, number][] = [];
  let start: number | null = null;
  for (const e of [...events].sort((a, b) => a.time - b.time)) {
    if (e.type === 'IGNITION') {
      start ??= e.time;
    } else if (e.type === 'BURNOUT') {
      if (start != null) out.push([start, e.time]);
      else if (out.length) out[out.length - 1]![1] = Math.max(out[out.length - 1]![1], e.time);
      else out.push([0, e.time]);
      start = null;
    }
  }
  return out;
}

const isBoosting = (t: number, windows: readonly [number, number][]): boolean =>
  windows.some(([a, b]) => t >= a && t < b);

export type PhaseColors = { boost: string; coast: string; descent: string };

export interface ColoredTrack extends FlightTrack {
  colors: [number, number, number][];
}

/** The first branch's track, with every branch's in `tracks`, in `flightBranches` order. */
export interface FlightScene extends ColoredTrack {
  tracks: ColoredTrack[];
  /** Seconds, to a moment after the last branch's landing. */
  duration: number;
  apogeeIdx: number;
  callouts: { type: string; pos: THREE.Vector3; time: number }[];
  unitsPerMeter: number;
}

// For the last part down to settle in.
export const SETTLE_SECONDS = 2;

const last = <T>(items: readonly T[]): T | undefined => items[items.length - 1];

function nearestIndex(times: readonly number[], t: number): number {
  let best = 0;
  let bd = Infinity;
  times.forEach((at, i) => {
    const d = Math.abs(at - t);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

export function buildFlightScene(result: FlightResult, phase: PhaseColors): FlightScene {
  const flown = flightBranches(result).map((b, i) => ({
    rows: trackRows(b.series),
    events: b.events ?? [],
    summary: i === 0 ? result.summary : undefined,
  }));
  const main = flown[0]!;
  // Loop, don't spread: Math.max(...bigArray) overflows the argument stack.
  let maxA = 1;
  for (const r of main.rows) if (r.a > maxA) maxA = r.a;
  const s = 24 / maxA;

  const tracks = flown.map(({ rows, events, summary }): ColoredTrack => {
    const lastT = last(rows)?.t ?? 0;
    const apT = eventTime(events, 'APOGEE') ?? summary?.timeToApogee ?? lastT;
    const burns = boostWindows(events);
    const deployed = eventTime(events, 'RECOVERY_DEVICE_DEPLOYMENT');
    // Not EJECTION_CHARGE: a booster's charge lands in the sustainer's branch.
    const end = forwardFlightEnd({ events, summary });
    // A recorded attitude shows a flight with no recovery coming in as it did.
    const unrecovered = hasAttitude(rows) ? Infinity : Number.isFinite(end) ? end : lastT;
    return {
      ...buildTrack(rows, s, deployed ?? unrecovered),
      colors: rows.map((r) => {
        const c = new THREE.Color(isBoosting(r.t, burns) ? phase.boost : r.t <= apT ? phase.coast : phase.descent);
        return [c.r, c.g, c.b];
      }),
    };
  });

  const track = tracks[0]!;
  const burns = boostWindows(main.events);
  let apogeeIdx = 0;
  track.alts.forEach((a, i) => {
    if (a > track.alts[apogeeIdx]!) apogeeIdx = i;
  });
  const wanted: [FlightEvent['type'], number | undefined][] = [
    ['BURNOUT', last(burns)?.[1]],
    ['APOGEE', eventTime(main.events, 'APOGEE') ?? result.summary.timeToApogee ?? last(track.times) ?? 0],
    ['RECOVERY_DEVICE_DEPLOYMENT', eventTime(main.events, 'RECOVERY_DEVICE_DEPLOYMENT')],
    ['GROUND_HIT', eventTime(main.events, 'GROUND_HIT') ?? last(track.times)],
  ];
  const callouts: FlightScene['callouts'] = [];
  for (const [type, time] of wanted) {
    if (time == null) continue;
    // Empty after a kernel failure; a `!` would throw before the "no path" guard.
    const pos = track.scenePts[nearestIndex(track.times, time)];
    if (!pos) continue;
    if (callouts.some((c) => c.pos.distanceTo(pos) < 1.5)) continue;
    callouts.push({ type, pos, time });
  }
  let duration = 0;
  for (const t of tracks) duration = Math.max(duration, last(t.times) ?? 0);
  if (duration > 0) duration += SETTLE_SECONDS;
  return {
    ...track,
    tracks,
    duration,
    apogeeIdx,
    unitsPerMeter: s,
    callouts,
  };
}
