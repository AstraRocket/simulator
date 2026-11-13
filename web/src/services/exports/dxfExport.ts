import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { countOf, num } from '../../tree/nodeProps';
import { finCutContour, finMountOf, finRootPoints, type FinParent } from '../../tree/finPlanform';
import { COMPONENT_DEFAULTS } from '../design/componentDefaults';
import {
  nodeContext,
  plateOuter,
  ringBoreNeedIn,
  ringHolesIn,
  statedOrRingBore,
  type Hole,
  type Tube,
} from '../design/discGeometry';
import { parentStartOf } from '../../tree/axialRebase';
import { englishText, type Translate } from '../../i18n/keyedError';

// Geometry is in meters; only the writer converts to millimeters. DXF Y grows upward.
export const DXF_MIME = 'image/vnd.dxf';

import { M_TO_MM } from '../../prefs/units';
import { fixedDecimal } from '../files/numberText';
const EPS = 1e-6;
const CROSS_FRAC = 0.6;
const TEXT_H = 0.003;
const LABEL_GAP = 0.004;

type Layer = 'CUT' | 'REFERENCE' | 'TEXT';
interface Pt {
  x: number;
  y: number;
}
type Ent =
  | { kind: 'poly'; layer: Layer; pts: Pt[] }
  | { kind: 'circle'; layer: Layer; c: Pt; r: number }
  | { kind: 'line'; layer: Layer; a: Pt; b: Pt }
  | { kind: 'text'; layer: Layer; at: Pt; h: number; s: string };

interface Part {
  ents: Ent[];
}

type LabelText = (key: string, values?: Record<string, string | number>) => string;

// Falls back to English when R12's 7-bit ASCII would turn a line into question marks.
function labelText(t: Translate): LabelText {
  return (key, values) => {
    const s = t(key, values);
    return NON_ASCII.test(asciiFold(s)) ? englishText(key, values) : s;
  };
}

/** Zero-length edges break cutters. */
function dedupe(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > EPS || Math.abs(last.y - p.y) > EPS) out.push(p);
  }
  while (
    out.length > 1 &&
    Math.abs(out[0]!.x - out[out.length - 1]!.x) <= EPS &&
    Math.abs(out[0]!.y - out[out.length - 1]!.y) <= EPS
  ) {
    out.pop();
  }
  return out;
}

function finPart(node: ComponentNode, parent: FinParent, l: LabelText): Part | null {
  // `root` is the kernel's root chord, not the furthest-aft point (overhanging fins).
  const contour = finCutContour(node, parent);
  if (!contour) return null;
  const outline = dedupe(contour.map(([x, y]) => ({ x, y })));
  if (outline.length < 3) return null;
  const ents: Ent[] = [{ kind: 'poly', layer: 'CUT', pts: outline }];
  const rootPts = finRootPoints(node, parent);
  const rootEnd = rootPts[rootPts.length - 1]!;
  const root = rootEnd[0] - rootPts[0]![0];
  ents.push({
    kind: 'line',
    layer: 'REFERENCE',
    a: { x: rootPts[0]![0], y: rootPts[0]![1] },
    b: { x: rootEnd[0], y: rootEnd[1] },
  });
  const label = l(
    node.type === 'trapezoidfinset'
      ? 'export.dxf.trapezoidfinset'
      : node.type === 'ellipticalfinset'
        ? 'export.dxf.ellipticalfinset'
        : 'export.dxf.freeformfinset',
  );
  // `reduce`, not a spread: a long outline spread into Math.max can overflow the stack.
  const span = outline.reduce((m, p) => (p.y > m ? p.y : m), -Infinity);
  const count = countOf(node, 'finCount', COMPONENT_DEFAULTS.finset.finCount);
  const thickness = num(node, 'thickness', COMPONENT_DEFAULTS.finset.thickness);
  const labels = [
    count ? l('export.dxf.cutCount', { name: node.name || label, qty: count }) : node.name || label,
    l('export.dxf.finDims', { root: dim(root), span: dim(span), stock: dim(thickness) }),
  ];
  return { ents: [...ents, ...textBlock(ents, labels)] };
}

function discPart(
  node: ComponentNode,
  outerR: number,
  boreR: number | null,
  label: string,
  l: LabelText,
  holes: Hole[] | null = null,
  boreNeed: number | null = null,
): Part {
  const ents: Ent[] = [{ kind: 'circle', layer: 'CUT', c: { x: 0, y: 0 }, r: outerR }];
  if (holes) {
    for (const h of holes) ents.push({ kind: 'circle', layer: 'CUT', c: { x: h.y, y: h.z }, r: h.r });
    boreR = Math.max(...holes.map((h) => h.r));
  } else if (boreR !== null && boreR > EPS && boreR < outerR - EPS) {
    ents.push({ kind: 'circle', layer: 'CUT', c: { x: 0, y: 0 }, r: boreR });
  }
  const arm = outerR * CROSS_FRAC;
  ents.push(
    { kind: 'line', layer: 'REFERENCE', a: { x: -arm, y: 0 }, b: { x: arm, y: 0 } },
    { kind: 'line', layer: 'REFERENCE', a: { x: 0, y: -arm }, b: { x: 0, y: arm } },
  );
  const dims =
    boreR !== null && boreR > EPS && boreR < outerR - EPS
      ? l('export.dxf.discBoreDims', { diameter: dim(outerR * 2), bore: dim(boreR * 2) })
      : l('export.dxf.discDims', { diameter: dim(outerR * 2) });
  const labels = [node.name || label, dims];
  if (boreNeed !== null) labels.push(l('export.dxf.boreTooSmall', { bore: dim(boreNeed * 2) }));
  return { ents: [...ents, ...textBlock(ents, labels)] };
}

function partForNode(
  node: ComponentNode,
  enclosing: Tube | null,
  parent: ComponentNode | null,
  parentStart: number,
  finParent: FinParent,
  l: LabelText,
  holes: Hole[] | null = null,
  boreNeed: number | null = null,
): Part | null {
  switch (node.type) {
    case 'trapezoidfinset':
    case 'ellipticalfinset':
    case 'freeformfinset':
      // Tab height clamps to the parent's outer radius, not its bore (FinSet.getMaxTabHeight).
      return finPart(node, finParent, l);
    case 'bulkhead':
      return discPart(node, plateOuter(node, enclosing), null, l('export.dxf.bulkhead'), l);
    case 'centeringring': {
      const outer = plateOuter(node, enclosing);
      return discPart(
        node,
        outer,
        statedOrRingBore(node, parent, outer, parentStart),
        l('export.dxf.centeringring'),
        l,
        holes,
        boreNeed,
      );
    }
    default:
      return null;
  }
}

function bounds(ents: Ent[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const e of ents) {
    if (e.kind === 'poly') for (const p of e.pts) add(p.x, p.y);
    else if (e.kind === 'circle') {
      add(e.c.x - e.r, e.c.y - e.r);
      add(e.c.x + e.r, e.c.y + e.r);
    } else if (e.kind === 'line') {
      add(e.a.x, e.a.y);
      add(e.b.x, e.b.y);
    } else {
      add(e.at.x, e.at.y - e.h);
      add(e.at.x + e.h * 0.7 * e.s.length, e.at.y + e.h);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

function textBlock(geom: Ent[], lines: string[]): Ent[] {
  const b = bounds(geom);
  return lines.map((s, i) => ({
    kind: 'text' as const,
    layer: 'TEXT' as const,
    at: { x: b.minX, y: b.minY - LABEL_GAP - (i + 1) * (TEXT_H * 1.6) },
    h: TEXT_H,
    s,
  }));
}

function translate(ents: Ent[], dx: number, dy: number): Ent[] {
  const t = (p: Pt): Pt => ({ x: p.x + dx, y: p.y + dy });
  return ents.map((e) =>
    e.kind === 'poly'
      ? { ...e, pts: e.pts.map(t) }
      : e.kind === 'circle'
        ? { ...e, c: t(e.c) }
        : e.kind === 'line'
          ? { ...e, a: t(e.a), b: t(e.b) }
          : { ...e, at: t(e.at) },
  );
}

const NON_ASCII = /[^\x20-\x7e]/;

function asciiFold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‐-―]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/·/g, '-')
    .replace(/×/g, 'x')
    .replace(/Ø/g, 'dia ')
    .replace(/°/g, ' deg')
    .replace(/\s+/g, ' ');
}

function ascii(s: string): string {
  return asciiFold(s)
    .replace(/[^\x20-\x7e]/g, '?')
    .trim();
}

const toMm = (m: number) => fixedDecimal(m * M_TO_MM, 4);
const dim = (m: number) => fixedDecimal(m * M_TO_MM, 1, '?');

function serialize(ents: Ent[]): string {
  const out: string[] = [];
  const p = (code: number, val: string | number) => out.push(String(code), String(val));

  const b = bounds(ents);
  p(0, 'SECTION');
  p(2, 'HEADER');
  p(9, '$ACADVER');
  p(1, 'AC1009');
  p(9, '$INSUNITS');
  p(70, 4); // 4 = millimeters
  p(9, '$EXTMIN');
  p(10, toMm(b.minX));
  p(20, toMm(b.minY));
  p(9, '$EXTMAX');
  p(10, toMm(b.maxX));
  p(20, toMm(b.maxY));
  p(0, 'ENDSEC');

  p(0, 'SECTION');
  p(2, 'TABLES');
  p(0, 'TABLE');
  p(2, 'LAYER');
  p(70, 3);
  const layer = (name: string, aci: number) => {
    p(0, 'LAYER');
    p(2, name);
    p(70, 0);
    p(62, aci);
    p(6, 'CONTINUOUS');
  };
  layer('CUT', 7);
  layer('REFERENCE', 5);
  layer('TEXT', 3);
  p(0, 'ENDTAB');
  p(0, 'ENDSEC');

  p(0, 'SECTION');
  p(2, 'ENTITIES');
  for (const e of ents) {
    if (e.kind === 'circle') {
      p(0, 'CIRCLE');
      p(8, e.layer);
      p(10, toMm(e.c.x));
      p(20, toMm(e.c.y));
      p(40, toMm(e.r));
    } else if (e.kind === 'line') {
      p(0, 'LINE');
      p(8, e.layer);
      p(10, toMm(e.a.x));
      p(20, toMm(e.a.y));
      p(11, toMm(e.b.x));
      p(21, toMm(e.b.y));
    } else if (e.kind === 'text') {
      p(0, 'TEXT');
      p(8, e.layer);
      p(10, toMm(e.at.x));
      p(20, toMm(e.at.y));
      p(40, toMm(e.h));
      p(1, ascii(e.s));
    } else {
      p(0, 'POLYLINE');
      p(8, e.layer);
      p(66, 1);
      p(70, 1); // 70 bit 1 = closed
      for (const v of e.pts) {
        p(0, 'VERTEX');
        p(8, e.layer);
        p(10, toMm(v.x));
        p(20, toMm(v.y));
      }
      p(0, 'SEQEND');
    }
  }
  p(0, 'ENDSEC');
  p(0, 'EOF');
  return out.join('\n') + '\n';
}

export function componentToDxf(tree: RocketTree, nodeId: string, t: Translate = englishText): string | null {
  const ctx = nodeContext(tree, nodeId);
  if (!ctx) return null;
  const part = partForNode(
    ctx.node,
    ctx.enclosing,
    ctx.parent,
    ctx.parent ? parentStartOf(tree, ctx.parent) : 0,
    finMountOf(tree, nodeId),
    labelText(t),
    ringHolesIn(tree, ctx),
    ringBoreNeedIn(tree, nodeId),
  );
  if (!part) return null;
  const b = bounds(part.ents);
  return serialize(translate(part.ents, -b.minX, -b.minY));
}
