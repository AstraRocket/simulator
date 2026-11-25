import * as THREE from 'three';
import type { FlightEvent, FlightEventType } from '../../engine/openRocketEngine';
import type { FlightView } from './flightCamera';
import { trackPositionAt, type FlightTrack } from './flightTrack';

/** The view shown from a moment of the flight until the next cut's. */
export interface Cut {
  from: number;
  view: FlightView;
}

// Past the rod, held on the pad: half of what is left of the first burn, within these.
const LAUNCH_SECONDS = [0.5, 1.5] as const;
const CHASE_SECONDS = 2;
const CHASE_SHORTEST = 1;
const BEFORE_APOGEE = 1;
const AFTER_BURNOUT = 0.5;
const LANDING_SECONDS = 4;
const DESCENT_SHORTEST = 3;
// The farthest landing shown from the pad.
const PAD_SEES_M = 150;

const timesOf = (events: readonly FlightEvent[], type: FlightEventType): number[] =>
  events.filter((e) => e.type === type).map((e) => e.time);

/**
 * The launch from the pad, the boost from behind, then following it; a descent that lands near the pad is seen from
 * there, and the landing up close. `events` is the body's own record, `launch` the first body's, which alone holds
 * the liftoff.
 */
export function directorCuts(
  events: readonly FlightEvent[],
  launch: readonly FlightEvent[],
  track: FlightTrack,
  pad: THREE.Vector3,
  unitsPerMeter: number,
): Cut[] {
  const cuts: Cut[] = [{ from: -Infinity, view: 'pad' }];
  const liftoff = timesOf(launch, 'LIFTOFF')[0];
  if (liftoff == null) return cuts;
  const landing = timesOf(events, 'GROUND_HIT')[0] ?? Infinity;
  const apogee = timesOf(events, 'APOGEE')[0] ?? landing;
  const rod = timesOf(launch, 'LAUNCHROD')[0] ?? liftoff;
  const burnouts = timesOf(events, 'BURNOUT').filter((t) => t > rod && t <= apogee);
  const burnout = Math.max(rod, ...burnouts);

  const [least, most] = LAUNCH_SECONDS;
  const up = rod + THREE.MathUtils.clamp((Math.min(burnout, ...burnouts) - rod) / 2, least, most);
  const coast = Math.min(Math.max(burnout + AFTER_BURNOUT, up + CHASE_SECONDS), apogee - BEFORE_APOGEE);
  const chased = coast - up >= CHASE_SHORTEST;
  if (chased) cuts.push({ from: up, view: 'chase' });
  cuts.push({ from: chased ? coast : up, view: 'follow' });

  const down = landing - LANDING_SECONDS;
  if (!Number.isFinite(landing) || down < Math.max(apogee + DESCENT_SHORTEST, up)) return cuts;
  const away = trackPositionAt(track, landing, new THREE.Vector3()).distanceTo(pad);
  if (away <= PAD_SEES_M * unitsPerMeter) cuts.push({ from: down, view: 'pad' }, { from: landing, view: 'follow' });
  return cuts;
}

export function directedView(cuts: readonly Cut[], t: number): FlightView {
  let view: FlightView = 'pad';
  for (const c of cuts) if (t >= c.from) view = c.view;
  return view;
}
