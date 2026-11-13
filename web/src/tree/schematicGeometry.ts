import type { ComponentNode, RocketTree, StaticInfo } from '../engine/openRocketEngine';
import { anyOuterRadius, innerTubeRadius, num, numOpt } from './nodeProps';
import { axialChain, axialLength, axialStart, partLength } from './position.js';
import { finSpan } from './finPlanform.js';
import { walkNodes } from './treeWalk.js';
import { nodeOuterProfile } from './shapeProfile.js';
import { isFinSet, tubeFinRadius } from './tubefins.js';
import { isChainType } from './componentKinds.js';
import { KERNEL_DEFAULTS, kernelDefault } from './kernelDefaults.js';
import { assemblyBoundingRadius, assemblyParentRadius, isAssembly, resolveAssemblyRadius } from './assembly.js';
import { stabilityState, stabilityVerdictKey, type StabilityState } from '../services/flight/simReport.js';
import { fmtNum, fmtPercent } from '../i18n/format';
import type { Units } from '../prefs/useUnits';

export interface Ctx {
  scale: number;
  cy: number;
  x0: number;
}

export const RULER_H = 32;
export const RULER_W = 46;

export const MARKER_R = 9;
export const CALLOUT_LANES = 34;
const LANE_GAP = 13;

/** Not interchangeable with `prefs/units.niceStep` (plain 1-2-5, no divide by 8). */
export function niceRulerStep(totalM: number): number {
  const target = Math.max(totalM, 1e-6) / 8;
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  for (const c of [1, 2, 2.5, 5, 10]) if (c * pow >= target) return c * pow;
  return 10 * pow;
}

export function snapNear(raw: number, snaps: number[], eps: number): number {
  let best = eps,
    out = raw;
  for (const s of snaps) {
    const d = Math.abs(s - raw);
    if (d < best) {
      best = d;
      out = s;
    }
  }
  return out;
}
const CP_LABEL_L = 6;
const CP_LABEL_R = 92;
const marginHalfW = (text: string) => (text.length * 7.2) / 2;

export interface CalloutLayout {
  cg: { x: number; leaderY1: number; leaderY2: number } | null;
  cp: { x: number; leaderY1: number; leaderY2: number } | null;
  margin: { x: number; y: number } | null;
}

/** @param halfPx viewBox px = vHalf * scale */
export function calloutLayout(
  cgX: number | null,
  cpX: number | null,
  cy: number,
  halfPx: number,
  w: number,
  h: number,
  marginText: string | null,
): CalloutLayout {
  const laneTop = Math.max(10, cy - Math.max(halfPx, MARKER_R) - LANE_GAP);
  const laneBottom = Math.min(h - 10, cy + Math.max(halfPx, MARKER_R) + LANE_GAP);
  const cg = cgX === null ? null : { x: cgX, leaderY1: cy - MARKER_R, leaderY2: laneTop };
  const cp = cpX === null ? null : { x: cpX, leaderY1: cy + MARKER_R, leaderY2: laneBottom };
  let margin: { x: number; y: number } | null = null;
  if (marginText !== null && cgX !== null && cpX !== null) {
    const halfW = marginHalfW(marginText);
    const clamp = (x: number) => Math.min(w - halfW - 2, Math.max(halfW + 2, x));
    const collides = (x: number) => x + halfW > cpX - CP_LABEL_L && x - halfW < cpX + CP_LABEL_R;
    let x = clamp((cgX + cpX) / 2);
    if (collides(x)) {
      const right = clamp(cpX + CP_LABEL_R + halfW);
      x = collides(right) ? clamp(cpX - CP_LABEL_L - halfW) : right;
    }
    margin = { x, y: laneBottom };
  }
  return { cg, cp, margin };
}

export { axialStart };

export function collect<T>(nodes: ComponentNode[], f: (n: ComponentNode) => T): T[] {
  return Array.from(walkNodes(nodes), (n) => f(n));
}

export function profilePath(
  ctx: Ctx,
  n: ComponentNode,
  x: number,
  len: number,
  foreR: number,
  aftR: number,
  baseY: number,
): string {
  const pts = nodeOuterProfile(n, len, foreR, aftR, 24);
  const px = (xi: number) => ctx.x0 + (x + xi) * ctx.scale;
  const top = pts.map(([xi, r]) => `${px(xi)} ${baseY - r * ctx.scale}`);
  const bottom = pts
    .slice()
    .reverse()
    .map(([xi, r]) => `${px(xi)} ${baseY + r * ctx.scale}`);
  return `M ${top.join(' L ')} L ${bottom.join(' L ')} Z`;
}

export function computeSchematicLayout(
  tree: RocketTree,
  info: StaticInfo | null,
  dims: {
    /** CSS px. */
    chPx: number;
    cw: number;
    maxHeight: number;
    fillHeight?: boolean;
    rulers?: { top: boolean; bottom: boolean; left: boolean; right: boolean };
  },
): {
  chain: ComponentNode[];
  totalLen: number;
  maxR: number;
  vHalf: number;
  snapXs: number[];
  radialSnaps: number[];
  rTop: number;
  rBot: number;
  rLeft: number;
  rRight: number;
  w: number;
  h: number;
  scale: number;
  ctx: Ctx;
} {
  const { chPx, cw, maxHeight, fillHeight } = dims;
  const chain = axialChain(tree);
  let totalLen = 0;
  let maxR = 0.001;
  for (const n of chain) {
    if (isChainType(n.type)) {
      totalLen += partLength(n);
      maxR = Math.max(maxR, anyOuterRadius(n));
    }
  }
  const spanOf = (n: ComponentNode, bodyR: number): number => {
    if (!isFinSet(n.type)) return 0;
    if (n.type === 'tubefinset') return 2 * tubeFinRadius(n, bodyR);
    return finSpan(n);
  };
  // Each span against its own body's radius, or auto-sized tube fins claim the widest body's reach.
  const collectFinSpans = (nodes: ComponentNode[], bodyR: number): number[] => {
    const out: number[] = [];
    const walk = (ns: ComponentNode[], r: number) => {
      for (const n of ns) {
        out.push(spanOf(n, r));
        if (n.children?.length) {
          const own = anyOuterRadius(n);
          walk(n.children, own > 0 ? own : r);
        }
      }
    };
    walk(nodes, bodyR);
    return out;
  };

  const protuberanceSpan = (n: ComponentNode): number =>
    n.type === 'fairing' ? num(n, 'height', KERNEL_DEFAULTS.fairing.height) : 0;
  const finH = Math.max(0, ...collectFinSpans(tree.components, maxR), ...collect(tree.components, protuberanceSpan));
  totalLen = Math.max(totalLen, 0.05);

  // m. A pod counts its parent's radius only on a body tube, as the kernel places it.
  let vHalf = maxR + finH;
  const scanRadial = (nodes: ComponentNode[], parent: ComponentNode | null) => {
    for (const n of nodes) {
      if (isAssembly(n.type)) {
        const podFin = Math.max(0, ...collectFinSpans(n.children ?? [], assemblyBoundingRadius(n)));
        vHalf = Math.max(
          vHalf,
          resolveAssemblyRadius(n, assemblyParentRadius(parent)) + assemblyBoundingRadius(n) + podFin,
        );
      }
      scanRadial(n.children ?? [], n);
    }
  };
  scanRadial(chain, null);

  const snapXs: number[] = [];
  const radialSet = new Set<number>([0, maxR, vHalf]);
  {
    let cx = 0;
    for (const n of chain) {
      if (isChainType(n.type)) {
        const len = partLength(n);
        snapXs.push(cx, cx + len);
        for (const child of n.children ?? []) {
          const clen = axialLength(child);
          if (clen > 0) {
            const cs = axialStart(child, clen, cx, len);
            snapXs.push(cs, cs + clen);
          }
        }
        const r = anyOuterRadius(n);
        if (r > 0) radialSet.add(r);
        cx += len;
      }
    }
  }
  const radialSnaps = [...radialSet];

  const w = Math.max(320, cw);
  const pad = 26;
  // Callout and ruler lanes stay out of the vertical fit, or a short/fat rocket would fill them and clip.
  const lanes = info ? CALLOUT_LANES : 0;
  const R = dims.rulers ?? { top: true, bottom: false, left: true, right: false };
  const rTop = R.top ? RULER_H : 0;
  const rBot = R.bottom ? RULER_H : 0;
  const rLeft = R.left ? RULER_W : 0;
  const rRight = R.right ? RULER_W : 0;
  const h = !fillHeight
    ? Math.round(
        Math.min(
          maxHeight,
          Math.max(200, 2 * vHalf * ((w - 2 * pad - rLeft - rRight) / totalLen) + 2 * pad + lanes + rTop + rBot),
        ),
      )
    : Math.max(200, chPx);
  const scale = Math.min(
    (w - 2 * pad - rLeft - rRight) / (totalLen * 1.12),
    (h - 2 * pad - lanes - rTop - rBot) / (2 * vHalf),
  );
  const x0 = Math.max(pad + rLeft, (w - totalLen * scale) / 2);
  const ctx: Ctx = { scale, cy: (h + rTop - rBot) / 2, x0 };
  return { chain, totalLen, maxR, vHalf, snapXs, radialSnaps, rTop, rBot, rLeft, rRight, w, h, scale, ctx };
}

/** A mass object with no radius flies `MassObject`'s 12.5 mm, whatever the tube around it. */
export function internalExtent(node: ComponentNode, parentRadius: number): { length: number; radius: number } {
  const stated = numOpt(node, 'outerRadius') ?? numOpt(node, 'radius');
  return {
    length: partLength(node),
    radius: stated ?? kernelDefault(node.type, 'radius') ?? parentRadius * 0.7,
  };
}

export function innerTubeExtent(node: ComponentNode): { length: number; radius: number } {
  return { length: axialLength(node), radius: innerTubeRadius(node) };
}

export const colorOf = (n: ComponentNode, dflt: string): string => (typeof n['color'] === 'string' ? n['color'] : dflt);

const FIGURE_TOKEN: Partial<Record<string, string>> = {
  nosecone: 'sch-shell',
  transition: 'sch-shell',
  bodytube: 'sch-shell-light',
  trapezoidfinset: 'sch-part',
  ellipticalfinset: 'sch-part',
  freeformfinset: 'sch-part',
  tubefinset: 'sch-part-light',
  fairing: 'sch-part-light',
  launchlug: 'sch-part-light',
  railbutton: 'sch-part-light',
  parachute: 'sch-parachute',
  streamer: 'sch-streamer',
  shockcord: 'sch-shockcord',
  masscomponent: 'sch-masscomponent',
  centeringring: 'sch-centeringring',
  bulkhead: 'sch-bulkhead',
  engineblock: 'sch-engineblock',
  tubecoupler: 'sch-tubecoupler',
  innertube: 'sch-innertube',
};

export const figureToken = (type: string): string => FIGURE_TOKEN[type] ?? 'sch-ink';

/** Meters, keyed by mount node id. */
export type MotorDims = Record<string, { length: number; diameter: number; label?: string }>;

export const STABILITY_GLYPH: Record<StabilityState, string> = {
  under: '⚠',
  over: '△',
  ok: '✓',
};

export function marginText(
  cal: number,
  pct: number | null,
  t: (key: string) => string,
): { state: StabilityState; glyph: string; figures: string; text: string } | null {
  const state = stabilityState(cal);
  if (!state || pct == null || !Number.isFinite(pct)) return null;
  const glyph = STABILITY_GLYPH[state];
  const figures = `${fmtNum(cal, 2)} ${t('stability.caliber')} · ${fmtPercent(pct, 1)}`;
  return { state, glyph, figures, text: `${glyph} ${figures} (${t(stabilityVerdictKey(cal))})` };
}

/** "CG · 412 mm": the marker's name and its station from the nose tip. */
export function stationLabel(
  t: (key: string) => string,
  u: Pick<Units, 'fmtSym'>,
  which: 'cg' | 'cp',
  x: number,
): string {
  return `${t(`schematic.${which}`)} · ${u.fmtSym('length', x)}`;
}

/** Scale `k` about the origin, then translate (viewBox units). */
export interface ZoomState {
  k: number;
  x: number;
  y: number;
}

export const ZOOM_IDENTITY: ZoomState = { k: 1, x: 0, y: 0 };

export const isZoomIdentity = (z: ZoomState): boolean => z.k === 1 && z.x === 0 && z.y === 0;

/** Returns the same object on no change so a setter can bail. */
export function zoomAbout(z: ZoomState, px: number, py: number, k: number): ZoomState {
  if (k === z.k) return z;
  if (k === 1) return ZOOM_IDENTITY;
  const mx = (px - z.x) / z.k;
  const my = (py - z.y) / z.k;
  return { k, x: px - mx * k, y: py - my * k };
}

export const MAX_ZOOM = 12;

export const WHEEL_ZOOM_FACTOR = 1.2;

export function zoomStep(z: ZoomState, px: number, py: number, f: number, max: number): ZoomState {
  return zoomAbout(z, px, py, Math.min(max, Math.max(1, z.k * f)));
}

/** Layout px. */
export interface HoverBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const unionBox = (a: HoverBox, b: HoverBox): HoverBox => ({
  x0: Math.min(a.x0, b.x0),
  y0: Math.min(a.y0, b.y0),
  x1: Math.max(a.x1, b.x1),
  y1: Math.max(a.y1, b.y1),
});

export function hoverTagFor(box: HoverBox, name: string, w: number, h: number): { x: number; y: number; tw: number } {
  const tw = name.length * 6.2 + 14;
  return {
    x: Math.min(w - tw / 2 - 2, Math.max(tw / 2 + 2, (box.x0 + box.x1) / 2)),
    y: box.y0 - 22 >= 2 ? box.y0 - 13 : Math.min(h - 11, box.y1 + 13),
    tw,
  };
}

export interface RulerGraduations {
  /** Model meters from the nose. */
  rulerMarks: number[];
  /** ViewBox y; label in meters. */
  vTicks: { y: number; label: number }[];
  rulerMinorMarks: number[];
  vMinorTicks: number[];
}

/** `x0`, `vy0`, `vTop` in viewBox px; `vSpanM` in meters. */
export function rulerGraduations({
  showLen,
  showRad,
  rulerStep,
  rulerX0,
  rulerX1,
  x0,
  scale,
  vSpanM,
  vTop,
  vy0 = vTop,
}: {
  showLen: boolean;
  showRad: boolean;
  rulerStep: number;
  rulerX0: number;
  rulerX1: number;
  x0: number;
  scale: number;
  vSpanM: number;
  vTop: number;
  vy0?: number;
}): RulerGraduations {
  const marks: number[] = [];
  if (showLen) {
    const mLo = Math.ceil((rulerX0 - x0) / scale / rulerStep - 1e-6) * rulerStep;
    const mHi = (rulerX1 - x0) / scale;
    for (let m = mLo; m <= mHi + 1e-6; m += rulerStep) marks.push(m);
  }
  const ticks: { y: number; label: number }[] = [];
  const vLo = (vTop - vy0) / scale;
  const vHi = vLo + vSpanM;
  if (showRad) {
    // `+ 0`: ceil of a hair under zero is -0, which would label as "-0".
    const mLo = Math.ceil(vLo / rulerStep - 1e-6) * rulerStep + 0;
    for (let m = mLo; m <= vHi + 1e-6; m += rulerStep) ticks.push({ y: vy0 + m * scale, label: m });
  }
  const minorMarks: number[] = [];
  const minorTicks: number[] = [];
  if (showLen) {
    const minorX = rulerStep / 5;
    const mLo = Math.ceil((rulerX0 - x0) / scale / minorX - 1e-6) * minorX;
    const mHi = (rulerX1 - x0) / scale;
    for (let m = mLo; m <= mHi + 1e-6; m += minorX) minorMarks.push(m);
  }
  if (showRad) {
    const minorV = rulerStep / 5;
    const mLo = Math.ceil(vLo / minorV - 1e-6) * minorV;
    for (let m = mLo; m <= vHi + 1e-6; m += minorV) minorTicks.push(m);
  }
  return { rulerMarks: marks, vTicks: ticks, rulerMinorMarks: minorMarks, vMinorTicks: minorTicks };
}
