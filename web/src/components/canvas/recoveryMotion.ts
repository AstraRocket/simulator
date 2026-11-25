import * as THREE from 'three';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { outsideAppearance } from '../../services/design/appearance';
import type { PartPalette } from '../../services/design/partColors';
import type { Deployment } from '../../services/flight/flightSources';
import { KERNEL_DEFAULTS } from '../../tree/kernelDefaults';
import { num } from '../../tree/nodeProps';

/** Meters. */
export type RecoveryShape =
  | { kind: 'parachute'; mouth: number; lines: number; lineLength: number; color: string }
  | { kind: 'streamer'; length: number; width: number; color: string };

// Parachute.AUTO_LINE_LENGTH_RATIO
const AUTO_LINE_LENGTH_RATIO = 1.5;
// An open canopy's mouth radius against its flat diameter.
const MOUTH_RADIUS = 0.33;

export function recoveryShape(n: ComponentNode, palette: PartPalette): RecoveryShape {
  const color = outsideAppearance(n, palette).paint;
  if (n.type !== 'parachute') {
    const { stripLength, stripWidth } = KERNEL_DEFAULTS.streamer;
    return {
      kind: 'streamer',
      length: num(n, 'stripLength', stripLength),
      width: num(n, 'stripWidth', stripWidth),
      color,
    };
  }
  const defaults = KERNEL_DEFAULTS.parachute;
  const diameter = num(n, 'diameter', defaults.diameter);
  const mouth = diameter * MOUTH_RADIUS;
  const line =
    n['lineLengthAuto'] === true ? diameter * AUTO_LINE_LENGTH_RATIO : num(n, 'lineLength', defaults.lineLength);
  return {
    kind: 'parachute',
    mouth,
    lines: THREE.MathUtils.clamp(Math.round(num(n, 'lineCount', defaults.lineCount)), 3, 48),
    lineLength: Math.max(line, mouth * 1.2),
    color,
  };
}

/** How far it reaches to a side at its middle, and how far off that middle is from where it is tied. */
const spanOf = (s: RecoveryShape): { radius: number; reach: number } =>
  s.kind === 'parachute' ? { radius: s.mouth, reach: s.lineLength } : { radius: s.width, reach: s.length / 2 };

const OPEN_SECONDS = 0.6;
const PACKED = 0.12;

/** A canopy's width against its full one, `age` seconds after it deploys: past full and back, then steady. */
export function inflation(age: number): number {
  if (age <= 0) return PACKED;
  const u = age / OPEN_SECONDS;
  return PACKED + (1 - PACKED) * (1 - Math.exp(-3.4 * u) * Math.cos(4.2 * u));
}

const UNROLL_SECONDS = 0.35;

/** How far out it has run, up to 1. */
export const unrolled = (age: number): number => 0.05 + 0.95 * THREE.MathUtils.smoothstep(age, 0, UNROLL_SECONDS);

const FALL_SECONDS = 1.2;

/** How far it has spilled its air since it landed, 0 to 1. */
export const collapse = (sinceLanding: number): number => THREE.MathUtils.smoothstep(sinceLanding, 0, FALL_SECONDS);

/** A device out, with those it shares a body and a copy of it with. */
export interface OutDevice extends Pick<Deployment, 'body' | 'from' | 'to'> {
  shape: RecoveryShape;
  group: string;
}

const ROOM_SECONDS = 1.5;

/** How far a body's devices reach from where they are tied at `t`, in meters. Kept on the ground. */
export function reachAbove(out: readonly OutDevice[], body: number, t: number): number {
  let reach = 0;
  out.forEach((d) => {
    const s = d.shape;
    if (d.body !== body) return;
    const own = s.kind === 'parachute' ? s.lineLength + s.mouth : s.length;
    reach = Math.max(reach, own * THREE.MathUtils.smoothstep(t, d.from, d.from + ROOM_SECONDS));
  });
  return reach;
}

const SWAY = 0.07;
const MAX_LEAN = 0.5;
const UP = new THREE.Vector3(0, 1, 0);
const axis = new THREE.Vector3();
const turn = new THREE.Quaternion();

/**
 * Turns a device, tied at its origin and lying along +Y, to lie along `dir`, swaying, and leaning clear of the others
 * its body has out. `aside` leans it clear of what is above it, 0 to 1.
 */
export function deviceTurn(
  out: readonly OutDevice[],
  i: number,
  t: number,
  dir: THREE.Vector3,
  into: THREE.Quaternion,
  aside = 0,
): THREE.Quaternion {
  const own = out[i]!;
  const { radius, reach } = spanOf(own.shape);
  into.setFromUnitVectors(UP, dir);
  let lean = MAX_LEAN * aside;
  let before = 0;
  out.forEach((d, k) => {
    if (k === i || d.group !== own.group || t < d.from) return;
    if (k < i) before++;
    const other = spanOf(d.shape);
    const clear = Math.min(MAX_LEAN, (radius + other.radius) / (reach + other.reach));
    const both = Math.max(d.from, own.from);
    lean = Math.max(lean, clear * THREE.MathUtils.smoothstep(t, both, both + 1));
  });
  if (lean > 0) {
    // Two lie opposite; more fan around.
    const around = before * Math.PI * (before < 2 ? 1 : 0.62);
    into.multiply(turn.setFromAxisAngle(axis.set(Math.cos(around), 0, Math.sin(around)), lean));
  }
  const age = t - own.from;
  const rate = 0.7 * Math.sqrt(9.81 / Math.max(reach, 0.1));
  const sway = SWAY * THREE.MathUtils.smoothstep(age, 0, 3) * (1 - collapse(t - own.to));
  into.multiply(turn.setFromAxisAngle(axis.set(1, 0, 0), sway * Math.sin(age * rate)));
  return into.multiply(turn.setFromAxisAngle(axis.set(0, 0, 1), 0.7 * sway * Math.sin(age * rate * 0.83 + i)));
}

const PER_GORE = 6;
const CANOPY_RINGS = 10;
const CANOPY_HEIGHT = 0.75;
const PINCH = 0.94;

/** In mouth radii above its mouth: each gore bellies out between its lines. */
export function canopyGeometry(lines: number): THREE.BufferGeometry {
  const across = lines * PER_GORE;
  const pos: number[] = [];
  const col: number[] = [];
  const index: number[] = [];
  for (let r = 0; r <= CANOPY_RINGS; r++) {
    const down = (r / CANOPY_RINGS) * (Math.PI / 2);
    for (let k = 0; k <= across; k++) {
      const a = (k / across) * Math.PI * 2;
      const out = Math.sin(down) * (PINCH + (1 - PINCH) * Math.abs(Math.sin((a * lines) / 2)));
      pos.push(Math.cos(a) * out, CANOPY_HEIGHT * Math.cos(down), Math.sin(a) * out);
      const shade = Math.floor(k / PER_GORE) % 2 === 0 ? 1 : 0.82;
      col.push(shade, shade, shade);
      if (r === CANOPY_RINGS || k === across) continue;
      const p = r * (across + 1) + k;
      index.push(p, p + 1, p + across + 1, p + 1, p + across + 2, p + across + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** From the origin to a canopy's mouth, `reach` up. */
export function lineGeometry(lines: number, reach: number): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let k = 0; k < lines; k++) {
    const a = (k / lines) * Math.PI * 2;
    pos.push(0, 0, 0, Math.cos(a) * PINCH, reach, Math.sin(a) * PINCH);
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
}

const STRIP_ROWS = 48;

/** Two points a row, set by `waveStrip`. */
export function stripGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(STRIP_ROWS * 2 * 3), 3));
  const index: number[] = [];
  for (let r = 0; r < STRIP_ROWS - 1; r++) {
    const p = r * 2;
    index.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
  }
  g.setIndex(index);
  return g;
}

/** A streamer `length` up +Y from its origin, waving as it trails. */
export function waveStrip(pos: THREE.BufferAttribute, length: number, width: number, age: number): void {
  const out = unrolled(age);
  for (let r = 0; r < STRIP_ROWS; r++) {
    const u = r / (STRIP_ROWS - 1);
    const phase = u * 13 - age * 14;
    const swing = width * 0.8 * Math.sqrt(u);
    const x = 0.5 * swing * Math.sin(phase * 0.63 + 1);
    const z = swing * Math.sin(phase);
    const twist = 0.5 * Math.sin(phase * 0.4);
    for (let side = 0; side < 2; side++) {
      const half = (side - 0.5) * width;
      pos.setXYZ(r * 2 + side, x + half * Math.cos(twist), u * length * out, z + half * Math.sin(twist));
    }
  }
  pos.needsUpdate = true;
}
