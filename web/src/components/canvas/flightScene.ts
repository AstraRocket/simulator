import * as THREE from 'three';
import type { FlightResult, RocketTree } from '../../engine/openRocketEngine';
import { KERNEL_DEFAULTS } from '../../tree/kernelDefaults';
import { findRecoveryDevices } from '../../services/design/treeEdit';
import { num } from '../../tree/nodeProps';
import type { PartPalette } from '../../services/design/partColors';
import { outsideAppearance } from '../../services/design/appearance';

// Kernel Px is east, Py north; with three.js +y up, north is -z (on +z the scene mirrors).
export function sceneFromEnu(east: number, up: number, north: number): THREE.Vector3 {
  return new THREE.Vector3(east, up, -north);
}

// A burnout with no open burn extends the previous window (cluster motors burning out apart).
export function boostWindows(events: readonly { type: string; time: number }[]): [number, number][] {
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

export const burnAt = (t: number, windows: readonly [number, number][]): number =>
  windows.findIndex(([a, b]) => t >= a && t < b);

export function delayWindows(
  events: readonly { type: string; time: number }[],
  burns: readonly [number, number][],
): [number, number][] {
  const charges = events.filter((e) => e.type === 'EJECTION_CHARGE').map((e) => e.time);
  const out: [number, number][] = [];
  burns.forEach(([, end], i) => {
    const nextBurn = burns[i + 1]?.[0] ?? Infinity;
    const charge = charges.filter((t) => t > end && t <= nextBurn).sort((a, b) => a - b)[0];
    if (charge != null) out.push([end, charge]);
  });
  return out;
}

export interface SmokePuff {
  pos: THREE.Vector3;
  time: number;
  burn: number;
  delay: boolean;
}

export function smokePuffs(
  scene: Pick<FlightScene, 'scenePts' | 'times' | 'boostWindows'> & Partial<Pick<FlightScene, 'delayWindows'>>,
  max: number,
  tail = 0,
  gap = 0,
): SmokePuff[] {
  const { scenePts, times, boostWindows: burns, delayWindows: delays = [] } = scene;
  const smokeAt = (t: number): { burn: number; delay: boolean } | null => {
    const burn = burnAt(t, burns);
    if (burn >= 0) return { burn, delay: false };
    const d = delays.findIndex(([a, b]) => t >= a && t < b);
    if (d < 0) return null;
    const opened = burns.findIndex(([, end]) => end === delays[d]![0]);
    return { burn: Math.max(0, opened), delay: true };
  };
  const inBurn: number[] = [];
  for (let i = 0; i < times.length; i++) if (smokeAt(times[i]!)) inBurn.push(i);
  const step = Math.max(1, inBurn.length / max);
  const out: SmokePuff[] = [];
  const dir = new THREE.Vector3();
  for (let k = 0; k < inBurn.length && out.length < max; k += step) {
    const i = inBurn[Math.floor(k)]!;
    const prev = scenePts[Math.max(0, i - 1)]!;
    const next = scenePts[Math.min(scenePts.length - 1, i + 1)]!;
    dir.subVectors(next, prev);
    if (dir.lengthSq() < 1e-12) dir.set(0, 1, 0);
    const pos = scenePts[i]!.clone().addScaledVector(dir.normalize(), -tail);
    pos.y = Math.max(pos.y, 0);
    const last = out[out.length - 1];
    if (last && last.pos.distanceTo(pos) < gap) continue;
    const smoke = smokeAt(times[i]!);
    if (smoke) out.push({ pos, time: times[i]!, ...smoke });
  }
  return out;
}

export type PhaseColors = { boost: string; coast: string; descent: string };

export interface FlightScene {
  colors: [number, number, number][];
  scenePts: THREE.Vector3[];
  apogeeIdx: number;
  deployT: number;
  boostWindows: [number, number][];
  delayWindows: [number, number][];
  times: number[];
  alts: number[];
  vels: number[];
  callouts: { type: string; pos: THREE.Vector3; time: number }[];
  unitsPerMeter: number;
}

export function buildFlightScene(result: FlightResult, phase: PhaseColors): FlightScene {
  const time = result.series.time ?? [];
  const alt = result.series.altitude ?? [];
  const vel = result.series.velocity ?? [];
  const px = result.series.Px ?? [];
  const py = result.series.Py ?? [];
  const rows: { t: number; a: number; v: number; east: number; north: number }[] = [];
  for (let i = 0; i < time.length; i++) {
    if (!Number.isFinite(time[i]) || !Number.isFinite(alt[i])) continue;
    rows.push({
      t: time[i]!,
      a: alt[i]!,
      v: Number.isFinite(vel[i]) ? vel[i]! : 0,
      east: Number(px[i]) || 0,
      north: Number(py[i]) || 0,
    });
  }
  // Loop, don't spread: Math.max(...bigArray) overflows the argument stack.
  let maxA = 1;
  for (const r of rows) if (r.a > maxA) maxA = r.a;
  const s = 24 / maxA;
  const evT = (type: string) => result.events.find((e) => e.type === type)?.time;
  const burns = boostWindows(result.events);
  const lastBurnout = burns[burns.length - 1]?.[1];
  // Seconds, not `maxA` (meters).
  const lastT = rows[rows.length - 1]?.t ?? 0;
  const apT = evT('APOGEE') ?? result.summary.timeToApogee ?? lastT;
  // Matches `forwardFlightEnd`. Not EJECTION_CHARGE: a booster's charge lands in the sustainer's branch.
  const deployed = evT('RECOVERY_DEVICE_DEPLOYMENT');
  const dpT = deployed ?? apT;
  const sp = rows.map((r) => sceneFromEnu(r.east * s, r.a * s, r.north * s));
  const cols = rows.map((r): [number, number, number] => {
    const c = new THREE.Color(isBoosting(r.t, burns) ? phase.boost : r.t <= apT ? phase.coast : phase.descent);
    return [c.r, c.g, c.b];
  });
  let ai = 0;
  rows.forEach((r, i) => {
    if (r.a > rows[ai]!.a) ai = i;
  });
  const idxAt = (tt: number) => {
    let bi = 0,
      bd = Infinity;
    rows.forEach((r, i) => {
      const d = Math.abs(r.t - tt);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    return bi;
  };
  const wanted: [string, number | undefined][] = [
    ['BURNOUT', lastBurnout],
    ['APOGEE', apT],
    ['RECOVERY_DEVICE_DEPLOYMENT', deployed],
    ['GROUND_HIT', evT('GROUND_HIT') ?? rows[rows.length - 1]?.t],
  ];
  const cos: { type: string; pos: THREE.Vector3; time: number }[] = [];
  for (const [type, tt] of wanted) {
    if (tt == null) continue;
    // `sp` can be empty after a kernel failure; a `!` would throw before the "no path" guard.
    const pos = sp[idxAt(tt)];
    if (!pos) continue;
    if (cos.some((c) => c.pos.distanceTo(pos) < 1.5)) continue;
    cos.push({ type, pos, time: tt });
  }
  return {
    colors: cols,
    scenePts: sp,
    apogeeIdx: ai,
    deployT: dpT,
    boostWindows: burns,
    delayWindows: delayWindows(result.events, burns),
    times: rows.map((r) => r.t),
    alts: rows.map((r) => r.a),
    vels: rows.map((r) => r.v),
    unitsPerMeter: s,
    callouts: cos,
  };
}

// `progress` is a fraction of flight time, not sample count: samples cluster in the boost.
export function indexForProgress(times: readonly number[], progress: number): number {
  const n = times.length;
  if (n === 0) return 0;
  const totalT = times[n - 1] || 1;
  const target = progress * totalT;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid]! <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface ModelPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  nose: THREE.Vector3;
}

export const newModelPose = (): ModelPose => ({
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  nose: new THREE.Vector3(),
});

const UP = new THREE.Vector3(0, 1, 0);
const NOSE_AXIS = new THREE.Vector3(-1, 0, 0);
const tangent = new THREE.Vector3();

// Nose is local -X. Writes into `out`: called every frame.
export function modelPoseAt(
  scenePts: readonly THREE.Vector3[],
  idx: number,
  descending: boolean,
  modelLen: number,
  out: ModelPose,
): ModelPose {
  const n = scenePts.length;
  const at = scenePts[Math.min(n - 1, Math.max(0, idx))];
  if (!at) {
    out.position.set(0, 0, 0);
    out.quaternion.identity();
    out.nose.set(-modelLen / 2, 0, 0);
    return out;
  }
  tangent.subVectors(scenePts[Math.min(n - 1, idx + 1)]!, scenePts[Math.max(0, idx - 1)]!);
  if (tangent.lengthSq() < 1e-8) tangent.set(0, 1, 0);
  else tangent.normalize();
  const dir = descending ? UP : tangent;
  out.quaternion.setFromUnitVectors(NOSE_AXIS, dir);
  out.position.copy(at);
  out.position.y += Math.max(0, (modelLen / 2) * Math.abs(dir.y) - at.y);
  out.nose.copy(out.position).addScaledVector(dir, modelLen / 2);
  return out;
}

export type Recovery =
  | { kind: 'parachute'; diameter: number; color: string }
  | { kind: 'streamer'; length: number; width: number; color: string }
  | null;
export function findRecovery(tree: RocketTree, palette: PartPalette): Recovery {
  const n = findRecoveryDevices(tree)[0];
  if (!n) return null;
  const color = outsideAppearance(n, palette).paint;
  return n.type === 'parachute'
    ? { kind: 'parachute', diameter: num(n, 'diameter', KERNEL_DEFAULTS.parachute.diameter), color }
    : {
        kind: 'streamer',
        length: num(n, 'stripLength', KERNEL_DEFAULTS.streamer.stripLength),
        width: num(n, 'stripWidth', KERNEL_DEFAULTS.streamer.stripWidth),
        color,
      };
}
