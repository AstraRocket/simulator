import * as THREE from 'three';
import type { FlightEvent, FlightResult } from '../../engine/openRocketEngine';
import { flightBranches } from '../../services/flight/flightColumns';
import { eventTime, forwardFlightEnd } from '../../services/flight/flightEvents';
import { buildTrack, hasAttitude, trackRows, type FlightTrack } from './flightTrack';
import { rowsOnTerrain, type HeightAt } from './terrainTrack';

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
  /** From here on the path is carried past the engine's last sample to the ground: an estimate. */
  estimatedFromT: number;
}

/** The first branch's track, with every branch's in `tracks`, in `flightBranches` order. */
export interface FlightScene extends ColoredTrack {
  tracks: ColoredTrack[];
  /** Seconds, to a moment after the last branch's landing. */
  duration: number;
  apogeeIdx: number;
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

/** `heightAt` lands the flight on real ground; without it, on level ground at the pad's height, as the engine flies. */
export function buildFlightScene(result: FlightResult, phase: PhaseColors, heightAt?: HeightAt): FlightScene {
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

  const tracks = flown.map(({ rows: engineRows, events, summary }): ColoredTrack => {
    const landed = eventTime(events, 'GROUND_HIT') != null;
    const { rows, estimatedFromT } = heightAt
      ? rowsOnTerrain(engineRows, heightAt, landed)
      : { rows: engineRows, estimatedFromT: Infinity };
    const lastT = last(rows)?.t ?? 0;
    const apT = eventTime(events, 'APOGEE') ?? summary?.timeToApogee ?? lastT;
    const burns = boostWindows(events);
    const deployed = eventTime(events, 'RECOVERY_DEVICE_DEPLOYMENT');
    // Not EJECTION_CHARGE: a booster's charge lands in the sustainer's branch.
    const end = forwardFlightEnd({ events, summary });
    // A recorded attitude shows a flight with no recovery coming in as it did.
    const unrecovered = hasAttitude(rows) ? Infinity : Number.isFinite(end) ? end : lastT;
    let top = 0;
    rows.forEach((r, k) => {
      if (r.a > rows[top]!.a) top = k;
    });
    return {
      ...buildTrack(rows, s, deployed ?? unrecovered),
      // Level ground stays at 0 exactly: the engine's last sample can sit a hair below it.
      landY: heightAt ? (last(rows)?.a ?? 0) * s : 0,
      apexT: rows[top]?.t ?? 0,
      estimatedFromT,
      colors: rows.map((r) => {
        const c = new THREE.Color(isBoosting(r.t, burns) ? phase.boost : r.t <= apT ? phase.coast : phase.descent);
        return [c.r, c.g, c.b];
      }),
    };
  });

  const track = tracks[0]!;
  let apogeeIdx = 0;
  track.alts.forEach((a, i) => {
    if (a > track.alts[apogeeIdx]!) apogeeIdx = i;
  });
  let duration = 0;
  for (const t of tracks) duration = Math.max(duration, last(t.times) ?? 0);
  if (duration > 0) duration += SETTLE_SECONDS;
  return {
    ...track,
    tracks,
    duration,
    apogeeIdx,
    unitsPerMeter: s,
  };
}

/** An event to label on the path: `branch` picks the track it sits on. */
export interface PillEvent {
  time: number;
  branch: number;
  text: string;
}

/** One label on the path; events close together share it, each shown once reached. */
export interface EventPill {
  key: string;
  pos: THREE.Vector3;
  /** Which way the path runs through `pos`, unit length; zero where it has one sample. */
  along: THREE.Vector3;
  parts: { time: number; text: string }[];
}

// Scene units: closer than this, two labels would overlap, so they share one.
const PILL_MERGE = 1.5;

export function eventPills(scene: FlightScene, events: readonly PillEvent[]): EventPill[] {
  const pills: EventPill[] = [];
  for (const e of [...events].sort((a, b) => a.time - b.time)) {
    const track = scene.tracks[e.branch] ?? scene;
    // Empty after a kernel failure; a `!` would throw before the "no path" guard.
    const idx = nearestIndex(track.times, e.time);
    const pos = track.scenePts[idx];
    if (!pos) continue;
    const before = track.scenePts[Math.max(0, idx - 1)]!;
    const after = track.scenePts[Math.min(track.scenePts.length - 1, idx + 1)]!;
    const along = after.clone().sub(before).normalize();
    const near = pills.find((p) => p.pos.distanceTo(pos) < PILL_MERGE);
    if (!near)
      pills.push({ key: `${e.branch}:${e.time}:${pills.length}`, pos, along, parts: [{ time: e.time, text: e.text }] });
    // Same name at another time is another event: a booster's landing and the sustainer's, both by the pad.
    else if (!near.parts.some((part) => part.text === e.text && part.time === e.time))
      near.parts.push({ time: e.time, text: e.text });
  }
  return pills;
}

/** The middle of every track's span: labels are pushed away from it, to the outside of the flight. */
export function flightMiddle(scene: FlightScene): THREE.Vector3 {
  const box = new THREE.Box3();
  for (const t of scene.tracks) for (const p of t.scenePts) box.expandByPoint(p);
  return box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
}
