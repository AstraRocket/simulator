import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { tubeRadii } from '../design/discGeometry';
import { hasShoulder, shouldersOf } from '../../tree/shapeProfile';
import { axialFrames, type AxialFrame } from '../../tree/axialRebase';
import { lineageOf, walkNodes } from '../../tree/treeWalk';
import { uiToSi } from '../../prefs/units';
import { str } from '../../tree/nodeProps';

// Packed recovery gear is not subtracted, matching hobby charge calculators.

const BLOCKING = new Set(['bulkhead', 'centeringring', 'engineblock', 'tubecoupler', 'innertube']);

export interface EjectionBay {
  tubeId: string;
  tubeName: string;
  /** Inside diameter, m. */
  boreM: number;
  lengthM: number;
  wholeTube: boolean;
  pins: ShearPins;
}

/** m from the nose tip. */
interface Span {
  start: number;
  end: number;
}

export function ejectionBay(tree: RocketTree, deviceId: string): EjectionBay | null {
  const lineage = lineageOf(tree.components, deviceId);
  const tube = lineage.slice(1).find((n) => n.type === 'bodytube');
  if (!tube?.id) return null;
  const frames = axialFrames(tree);
  const tubeFrame = frames.get(tube.id);
  const deviceFrame = frames.get(deviceId);
  if (!tubeFrame || !deviceFrame) return null;

  const boreM = 2 * (tubeRadii(tube)?.innerR ?? 0);
  const tubeSpan = spanOf(tubeFrame);
  // The tube's own parent: a stage, or a pod set or booster holding its own chain.
  const holder = lineage[lineage.indexOf(tube) + 1];
  const siblings = holder?.children ?? tree.components;
  const blocks = [...innerBlocks(tube, new Set(lineage), frames), ...shoulderBlocks(siblings, tube, frames)];
  const device = spanOf(deviceFrame);
  const middle = (device.start + device.end) / 2;
  let fore = tubeSpan.start;
  let aft = tubeSpan.end;
  for (const b of blocks) {
    if (b.end <= middle) fore = Math.max(fore, b.end);
    else if (b.start >= middle) aft = Math.min(aft, b.start);
  }
  return {
    tubeId: tube.id,
    tubeName: str(tube, 'name'),
    boreM,
    lengthM: Math.max(0, aft - fore),
    wholeTube: fore === tubeSpan.start && aft === tubeSpan.end,
    pins: shearPinsIn(tube),
  };
}

const spanOf = (f: AxialFrame): Span => ({ start: f.start, end: f.start + f.length });

// `holders` (inner tubes carrying the device) are skipped: they do not wall it off.
function innerBlocks(tube: ComponentNode, holders: Set<ComponentNode>, frames: Map<string, AxialFrame>): Span[] {
  const out: Span[] = [];
  for (const c of walkNodes(tube.children ?? [])) {
    const f = c.id ? frames.get(c.id) : undefined;
    if (f && BLOCKING.has(c.type) && !holders.has(c)) out.push(spanOf(f));
  }
  return out;
}

function shoulderBlocks(siblings: ComponentNode[], tube: ComponentNode, frames: Map<string, AxialFrame>): Span[] {
  const i = siblings.findIndex((n) => n.id === tube.id);
  const out: Span[] = [];
  const before = siblings[i - 1];
  const after = siblings[i + 1];
  const frameOf = (n: ComponentNode | undefined) => (n?.id ? frames.get(n.id) : undefined);
  // A flipped nose cone's shoulder is on its fore end, so it plugs the tube in front of it.
  const b = frameOf(before);
  const intoAft = before && (before.type === 'nosecone' || before.type === 'transition') && shouldersOf(before).aft;
  if (b && intoAft && hasShoulder(intoAft)) {
    out.push({ start: b.start + b.length, end: b.start + b.length + intoAft.length });
  }
  const a = frameOf(after);
  const intoFore = after && (after.type === 'nosecone' || after.type === 'transition') && shouldersOf(after).fore;
  if (a && intoFore && hasShoulder(intoFore)) out.push({ start: a.start - intoFore.length, end: a.start });
  return out;
}

export const PIN_SIZES = ['2-56', '4-40', '6-32'] as const;
export type PinSize = (typeof PIN_SIZES)[number];

const LBF = uiToSi('force', 'lbf', 1);

/** N. */
export const PIN_STRENGTH_N: Readonly<Record<PinSize, number>> = {
  '2-56': 35 * LBF,
  '4-40': 60 * LBF,
  '6-32': 90 * LBF,
};

export const DEFAULT_PINS = { count: 3, size: '2-56' as PinSize };

export interface ShearPins {
  count: number;
  /** Null when the strength was given in the name rather than by size. */
  size: PinSize | null;
  /** Per pin, N. */
  forceN: number;
  from: string | null;
}

function shearPinsIn(tube: ComponentNode): ShearPins {
  for (const c of walkNodes(tube.children ?? [])) {
    if (c.type !== 'masscomponent' || typeof c.name !== 'string') continue;
    const pins = parseShearPins(c.name);
    if (pins) return pins;
  }
  return { ...DEFAULT_PINS, forceN: PIN_STRENGTH_N[DEFAULT_PINS.size], from: null };
}

// Accepts "3x 2-56", "shear pins 4-40 x4", "2 pins #4-40", "4 × 6-32 @ 95 lbf".
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
