import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { bodyTubeRadius, num } from '../../tree/nodeProps';
import { axialFrames, type AxialFrame } from '../../tree/axialRebase';
import { lineageOf, walkNodes } from '../../tree/treeWalk';
import { uiToSi } from '../../prefs/units';

/**
 * The recovery bay a recovery device sits in, read off the design, for its
 * ejection charge.
 *
 * The bay is the nearest body tube above the device in the tree: its parent,
 * or the tube around an inner tube the device is kept in so it can be moved
 * about. Its bore is the tube's inside
 * diameter. Its length is the free stretch of that tube the device sits in:
 * from the nearest part that closes the bore forward of the device to the
 * nearest one aft of it, or to the tube's own end where there is none. What
 * closes the bore is a bulkhead, a centering ring, an engine block, a coupler,
 * a motor mount's inner tube, and the shoulder of a nose cone or transition
 * that reaches into the tube. A design that models none of them gets the whole
 * tube, which overstates the charge rather than understating it, and says so.
 *
 * The packed recovery gear is not taken out of the volume, as hobby charge
 * calculators do not take it out either.
 */

/** Parts inside a tube that close its bore. */
const BLOCKING = new Set(['bulkhead', 'centeringring', 'engineblock', 'tubecoupler', 'innertube']);

export interface EjectionBay {
  /** The body tube the device is in. */
  tubeId: string;
  tubeName: string;
  /** Inside diameter, m. */
  boreM: number;
  /** The free stretch the device sits in, m. */
  lengthM: number;
  /** True when nothing closes the bore on either side and the whole tube is used. */
  wholeTube: boolean;
  pins: ShearPins;
}

/** One stretch along the rocket, m from the nose tip. */
interface Span {
  start: number;
  end: number;
}

/**
 * The bay of the recovery device `deviceId`, or null when no body tube holds
 * it.
 */
export function ejectionBay(tree: RocketTree, deviceId: string): EjectionBay | null {
  // The device, then each part above it, nearest first.
  const lineage = lineageOf(tree.components, deviceId);
  const tube = lineage.slice(1).find((n) => n.type === 'bodytube');
  if (!tube?.id) return null;
  const frames = axialFrames(tree);
  const tubeFrame = frames.get(tube.id);
  const deviceFrame = frames.get(deviceId);
  if (!tubeFrame || !deviceFrame) return null;

  const boreM = 2 * (bodyTubeRadius(tube) - num(tube, 'thickness', 0));
  const tubeSpan = spanOf(tubeFrame);
  const blocks = [...innerBlocks(tube, new Set(lineage), frames), ...shoulderBlocks(tree, tube, frames)];
  const device = spanOf(deviceFrame);
  // The nearest closure ahead of the device's middle and the nearest behind it.
  const middle = (device.start + device.end) / 2;
  let fore = tubeSpan.start;
  let aft = tubeSpan.end;
  for (const b of blocks) {
    if (b.end <= middle) fore = Math.max(fore, b.end);
    else if (b.start >= middle) aft = Math.min(aft, b.start);
  }
  return {
    tubeId: tube.id,
    tubeName: typeof tube.name === 'string' ? tube.name : '',
    boreM,
    lengthM: Math.max(0, aft - fore),
    wholeTube: fore === tubeSpan.start && aft === tubeSpan.end,
    pins: shearPinsIn(tube),
  };
}

const spanOf = (f: AxialFrame): Span => ({ start: f.start, end: f.start + f.length });

/**
 * The parts anywhere inside the tube that close its bore. The inner tubes the
 * device itself is kept in (`holders`) are left out: they carry the device,
 * not wall it off.
 */
function innerBlocks(tube: ComponentNode, holders: Set<ComponentNode>, frames: Map<string, AxialFrame>): Span[] {
  const out: Span[] = [];
  for (const c of walkNodes(tube.children ?? [])) {
    const f = c.id ? frames.get(c.id) : undefined;
    if (f && BLOCKING.has(c.type) && !holders.has(c)) out.push(spanOf(f));
  }
  return out;
}

/**
 * The shoulders of the parts either side of the tube that reach into it: a
 * nose cone's or a transition's aft shoulder from ahead, a transition's fore
 * shoulder from behind.
 */
function shoulderBlocks(tree: RocketTree, tube: ComponentNode, frames: Map<string, AxialFrame>): Span[] {
  const siblings = tree.components.flatMap((n) => (n.type === 'stage' ? (n.children ?? []) : [n]));
  const i = siblings.findIndex((n) => n.id === tube.id);
  const out: Span[] = [];
  const before = siblings[i - 1];
  const after = siblings[i + 1];
  const frameOf = (n: ComponentNode | undefined) => (n?.id ? frames.get(n.id) : undefined);
  const b = frameOf(before);
  if (before && b) {
    const shoulder =
      before.type === 'nosecone'
        ? num(before, 'shoulderLength', 0)
        : before.type === 'transition'
          ? num(before, 'aftShoulderLength', 0)
          : 0;
    if (shoulder > 0) out.push({ start: b.start + b.length, end: b.start + b.length + shoulder });
  }
  const a = frameOf(after);
  if (after && a && after.type === 'transition') {
    const shoulder = num(after, 'foreShoulderLength', 0);
    if (shoulder > 0) out.push({ start: a.start - shoulder, end: a.start });
  }
  return out;
}

/** The thread sizes the pin rule knows, by their usual name. */
export const PIN_SIZES = ['2-56', '4-40', '6-32'] as const;
export type PinSize = (typeof PIN_SIZES)[number];

const LBF = uiToSi('force', 'lbf', 1);

/**
 * Typical shear strength of one nylon pin of each size, N. Working figures,
 * not a maker's: nylon pins vary by brand, batch and humidity, and a measured
 * figure written into the pins' name (`@40lbf`) replaces these.
 */
export const PIN_STRENGTH_N: Readonly<Record<PinSize, number>> = {
  '2-56': 35 * LBF,
  '4-40': 60 * LBF,
  '6-32': 90 * LBF,
};

/** What a bay is assumed to carry when the design says nothing: three #2-56 nylon pins. */
export const DEFAULT_PINS = { count: 3, size: '2-56' as PinSize };

/** A bay's shear pins, and where the figure came from. */
export interface ShearPins {
  count: number;
  /** Null when the strength was given in the name rather than by size. */
  size: PinSize | null;
  /** One pin's strength, N. */
  forceN: number;
  /** The mass object's name they were read from; null for the default. */
  from: string | null;
}

/**
 * The shear pins a body tube carries: from a mass object anywhere inside it
 * whose name describes them, else {@link DEFAULT_PINS}. The first such object,
 * in tree order, wins.
 */
function shearPinsIn(tube: ComponentNode): ShearPins {
  for (const c of walkNodes(tube.children ?? [])) {
    if (c.type !== 'masscomponent' || typeof c.name !== 'string') continue;
    const pins = parseShearPins(c.name);
    if (pins) return pins;
  }
  return { ...DEFAULT_PINS, forceN: PIN_STRENGTH_N[DEFAULT_PINS.size], from: null };
}

/**
 * Shear pins as a mass object's name gives them, or null for a name that is not
 * about pins.
 *
 * Forgiving about order and spelling: "3x 2-56", "shear pins 4-40 x4",
 * "2 pins #4-40" and "4 × 6-32 @ 95 lbf" all read. A name is about pins when it
 * says "pin", "shear" or "friction", or names a thread size. "Friction fit" and
 * a count of 0 are a bay with no pins. A strength in the name (lbf, lb or N)
 * replaces the size's typical one. A count with no size is that many #2-56.
 */
export function parseShearPins(name: string): ShearPins | null {
  const s = name.toLowerCase();
  const size = PIN_SIZES.find((z) => new RegExp(`(^|[^0-9])#?\\s*${z}([^0-9]|$)`).test(s)) ?? null;
  if (!size && !/pin|shear|friction/.test(s)) return null;
  if (/friction/.test(s)) return { count: 0, size: null, forceN: 0, from: name };
  // A thread size's own digits are not a count, so take them out first.
  const rest = size ? s.replace(size, ' ') : s;
  const strength = /@\s*(\d+(?:\.\d+)?)\s*(lbf|lbs?|n)\b/.exec(rest);
  const countText = rest.replace(strength?.[0] ?? '', ' ');
  const count = /(\d+)\s*(?:x|×|\*|pins?|shear)/.exec(countText) ?? /(?:x|×|\*)\s*(\d+)/.exec(countText);
  const n = count ? Number(count[1]) : DEFAULT_PINS.count;
  const forceN = strength
    ? Number(strength[1]) * (strength[2] === 'n' ? 1 : LBF)
    : PIN_STRENGTH_N[size ?? DEFAULT_PINS.size];
  return { count: n, size: strength ? null : (size ?? DEFAULT_PINS.size), forceN, from: name };
}
