import * as THREE from 'three';
import { carrierAt, type FlightBody } from '../../services/flight/flightBodies';
import type { MountBurn, Pop } from '../../services/flight/flightSources';
import { windAt } from '../../services/flight/flightWind';
import { DEFAULT_EXHAUST, DELAY_SMOKE, type Exhaust } from '../../services/motors/exhaust';
import { extentCenter, newPlacement, placeCarrier, type BodySpan } from './bodyMotion';
import { sceneFromEnu, type FlightTrack } from './flightTrack';
import type { Nozzle } from './rocketPieces';

/** A cloud let go in the air. Drawn at `at` + model scale × (`arm` + `burst` as it spreads) + `drift` × age. */
export interface Puff {
  time: number;
  /** Scene units, where the recorded point was. */
  at: THREE.Vector3;
  /** Meters of rocket from there, turned as the rocket was. */
  arm: THREE.Vector3;
  /** Meters of rocket it is thrown, all told. */
  burst: THREE.Vector3;
  /** Scene units a second, with the wind. */
  drift: THREE.Vector3;
  /** Meters across when let go. */
  size: number;
  color: string;
  /** Opacity where the rocket is drawn at its true size. */
  alpha: number;
}

export interface SmokeFlight {
  bodies: readonly FlightBody[];
  tracks: readonly FlightTrack[];
  spans: readonly (readonly BodySpan[])[];
  /** Scene units per meter. */
  unitsPerMeter: number;
}

const MAX_TRAIL_PUFFS = 8000;
const TRAIL_STEP_S = 0.01;
// In motor diameters.
const TRAIL_SIZE = 2.6;
const TRAIL_GAP = 0.28; // in puffs
const DELAY_GAP = 0.45;
const DELAY_SIZE = 1.3;

const DELAY_THINNING = 0.55;

const place = newPlacement();

/** Where the rocket-frame point `x`, `y`, `z` of `body` is at `t`. */
function pointAt(
  { bodies, tracks, spans }: SmokeFlight,
  body: number,
  t: number,
  [x, y, z]: readonly [number, number, number],
): Pick<Puff, 'at' | 'arm'> | null {
  const carrier = carrierAt(bodies, body, t);
  const track = tracks[carrier];
  if (!track?.scenePts.length) return null;
  // At no size: the recorded point itself, not lifted to stand on the ground.
  placeCarrier(track, spans[carrier] ?? [], t, 0, place);
  const arm = new THREE.Vector3(x - extentCenter(place.span), y, z).applyQuaternion(place.quaternion);
  return { at: place.position.clone(), arm: arm.add(place.span.offset) };
}

function driftAt({ bodies, unitsPerMeter }: SmokeFlight, body: number, t: number): THREE.Vector3 {
  const branch = bodies[carrierAt(bodies, body, t)]?.branch;
  const wind = branch ? windAt(branch.series, t) : null;
  return wind ? sceneFromEnu(wind.east, 0, wind.north).multiplyScalar(unitsPerMeter) : new THREE.Vector3();
}

/** Nozzles close enough to smoke as one, at their middle. */
export function smokeSources(nozzles: readonly Nozzle[]): Nozzle[] {
  const groups: Nozzle[][] = [];
  for (const n of nozzles) {
    const near = groups.find((g) => {
      const [first] = g;
      return first && Math.hypot(n.at[1] - first.at[1], n.at[2] - first.at[2]) < 8 * n.radius;
    });
    if (near) near.push(n);
    else groups.push([n]);
  }
  return groups.map((g) => {
    const middle = (k: 0 | 1 | 2) => g.reduce((sum, n) => sum + n.at[k], 0) / g.length;
    return {
      mountId: g[0]!.mountId,
      at: [middle(0), middle(1), middle(2)],
      radius: g[0]!.radius * Math.sqrt(g.length),
    };
  });
}

interface Source {
  burn: MountBurn;
  nozzle: Nozzle;
  look: Exhaust;
}

interface Stretch {
  source: Source;
  from: number;
  to: number;
  delay: boolean;
  /** Meters, along the nozzle's way. */
  length: number;
}

const here = new THREE.Vector3();

/** The nozzle's position at `t`, the rocket at its true size, in meters. */
function nozzleAt(flight: SmokeFlight, { burn, nozzle }: Source, t: number, out: THREE.Vector3): boolean {
  const p = pointAt(flight, burn.body, t, nozzle.at);
  if (!p) return false;
  out.copy(p.at).divideScalar(flight.unitsPerMeter).add(p.arm);
  return true;
}

/** Calls `each` at even distances `gap` apart, and returns the distance covered. */
function walk(flight: SmokeFlight, s: Omit<Stretch, 'length'>, gap: number, each?: (t: number) => void): number {
  const steps = Math.max(1, Math.ceil((s.to - s.from) / TRAIL_STEP_S));
  const last = new THREE.Vector3();
  if (!nozzleAt(flight, s.source, s.from, last)) return 0;
  let length = 0;
  let due = gap;
  for (let i = 1; i <= steps; i++) {
    const t = s.from + ((s.to - s.from) * i) / steps;
    if (!nozzleAt(flight, s.source, t, here)) break;
    const moved = here.distanceTo(last);
    for (; each && moved > 0 && due <= length + moved; due += gap) {
      each(t - (1 - (due - length) / moved) * ((s.to - s.from) / steps));
    }
    length += moved;
    last.copy(here);
  }
  return length;
}

/** Every burn's smoke and every delay grain's, evenly spaced along the way of the nozzle it came from. */
export function trailPuffs(
  flight: SmokeFlight,
  burns: readonly MountBurn[],
  nozzles: readonly Nozzle[],
  looks: Readonly<Record<string, Exhaust>> | undefined,
): Puff[] {
  const stretches = burns.flatMap((burn): Stretch[] =>
    smokeSources(nozzles.filter((n) => n.mountId === burn.mountId)).flatMap((nozzle) => {
      const source: Source = { burn, nozzle, look: looks?.[burn.mountId] ?? DEFAULT_EXHAUST };
      const parts = [{ source, from: burn.from, to: burn.to, delay: false }];
      if (burn.charge != null) parts.push({ source, from: burn.to, to: burn.charge, delay: true });
      return parts.filter((p) => p.to > p.from).map((p) => ({ ...p, length: walk(flight, p, Infinity) }));
    }),
  );
  const wanted = (s: Stretch) => s.source.nozzle.radius * 2 * (s.delay ? DELAY_SIZE : TRAIL_SIZE);
  const gapOf = (s: Stretch) => (s.delay ? DELAY_GAP : TRAIL_GAP);
  let count = 0;
  for (const s of stretches) count += s.length / (wanted(s) * gapOf(s));
  // A long climb's puffs are fewer and larger, so they still meet.
  const spread = Math.max(1, count / MAX_TRAIL_PUFFS);
  return stretches.flatMap((s): Puff[] => {
    const size = wanted(s) * spread;
    const { smoke, smokeColor } = s.delay ? DELAY_SMOKE : s.source.look;
    const out: Puff[] = [];
    walk(flight, s, size * gapOf(s), (time) => {
      const p = pointAt(flight, s.source.burn.body, time, s.source.nozzle.at);
      if (!p) return;
      out.push({
        ...p,
        time,
        burst: new THREE.Vector3(),
        drift: driftAt(flight, s.source.burn.body, time),
        size,
        color: smokeColor,
        alpha: smoke * (s.delay ? DELAY_THINNING : 1),
      });
    });
    return out;
  });
}

const POP_PUFFS = 22;
const POP_COLOR = '#cfcdc6';
const GOLDEN = 2.399963;

/** An ejection charge out of the bay it opens, or the ring as two stages part. */
export function popPuffs(
  flight: SmokeFlight,
  pops: readonly Pop[],
  mouthOf: (body: number, time: number) => number,
  radius: number,
): Puff[] {
  return pops.flatMap((pop): Puff[] => {
    const p = pointAt(flight, pop.body, pop.time, [mouthOf(pop.body, pop.time), 0, 0]);
    if (!p) return [];
    const turn = place.quaternion.clone();
    const drift = driftAt(flight, pop.body, pop.time);
    const reach = radius * (pop.kind === 'ejection' ? 7 : 5);
    return Array.from({ length: POP_PUFFS }, (_, i): Puff => {
      const u = (i + 0.5) / POP_PUFFS;
      const far = reach * (0.35 + 0.65 * ((i * 0.618034) % 1));
      // Ejection: a cone forward (nose on -X). Separation: a flat ring.
      const along = pop.kind === 'ejection' ? -0.35 - 0.65 * u : 0.35 * (u - 0.5);
      const across = Math.sqrt(1 - along * along);
      const burst = new THREE.Vector3(along, Math.cos(i * GOLDEN) * across, Math.sin(i * GOLDEN) * across);
      return {
        time: pop.time,
        at: p.at.clone(),
        arm: p.arm.clone(),
        burst: burst.multiplyScalar(far).applyQuaternion(turn),
        drift,
        size: radius * 2.2,
        color: POP_COLOR,
        alpha: 0.5,
      };
    });
  });
}

const BLAST_PUFFS = 64;
const BLAST_SECONDS = 0.35;

/** The exhaust of the motors lit on the pad, spreading over the ground. */
export function blastPuffs(
  flight: SmokeFlight,
  burns: readonly MountBurn[],
  nozzles: readonly Nozzle[],
  looks: Readonly<Record<string, Exhaust>> | undefined,
): Puff[] {
  const first = Math.min(...burns.map((b) => b.from));
  return burns.flatMap((burn): Puff[] => {
    const nozzle = nozzles.find((n) => n.mountId === burn.mountId);
    const { smoke, smokeColor } = looks?.[burn.mountId] ?? DEFAULT_EXHAUST;
    if (!nozzle || burn.from > first + 0.05) return [];
    const until = Math.min(burn.to, burn.from + BLAST_SECONDS);
    return Array.from({ length: BLAST_PUFFS }, (_, i): Puff | null => {
      const u = (i + 0.5) / BLAST_PUFFS;
      const time = burn.from + (until - burn.from) * u;
      const p = pointAt(flight, burn.body, time, nozzle.at);
      if (!p) return null;
      const far = nozzle.radius * (16 + 54 * ((i * 0.618034) % 1));
      const around = i * GOLDEN;
      return {
        time,
        at: p.at.setY(0),
        arm: p.arm.setY(0),
        burst: new THREE.Vector3(Math.cos(around) * far, far * 0.12, Math.sin(around) * far),
        drift: driftAt(flight, burn.body, time).multiplyScalar(0.25),
        size: nozzle.radius * 12,
        color: smokeColor,
        // Thins as the rocket climbs away from the ground.
        alpha: smoke * 0.7 * (1 - 0.7 * u),
      };
    }).filter((p) => p != null);
  });
}

const DUST_PUFFS = 24;
const DUST_COLOR = '#a89878';

/** Kicked up as each body lands, the more the harder it does. */
export function dustPuffs(
  flight: SmokeFlight,
  landing: readonly { body: number; speed: number }[],
  radius: number,
): Puff[] {
  return landing.flatMap(({ body, speed }): Puff[] => {
    const track = flight.tracks[body];
    const end = track?.scenePts.at(-1);
    const time = track?.times.at(-1);
    if (!end || time == null) return [];
    const hard = THREE.MathUtils.clamp(speed / 10, 0.4, 4);
    return Array.from({ length: DUST_PUFFS }, (_, i): Puff => {
      const far = radius * (4 + 10 * ((i * 0.618034) % 1)) * hard;
      const around = i * GOLDEN;
      return {
        time,
        at: end.clone().setY(0),
        arm: new THREE.Vector3(),
        burst: new THREE.Vector3(Math.cos(around) * far, far * 0.3, Math.sin(around) * far),
        drift: driftAt(flight, body, time).multiplyScalar(0.4),
        size: radius * 3 * Math.sqrt(hard),
        color: DUST_COLOR,
        alpha: Math.min(0.5, 0.2 * hard),
      };
    });
  });
}
