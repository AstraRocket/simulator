// SI (meters).
import { lengthOf, outerDiameterOf, type Component, type ComponentType, type PickerType } from './componentDb';
import { compareSortKeys } from '../app/sortKeys';
import { distinctSorted } from '../app/collections';
import { KERNEL_DEFAULTS } from '../../tree/kernelDefaults';

/** Meters under a bore that still fit (a glue gap). */
const FIT_SLACK = 0.002;
/** Meters over a bore that still fit: catalog numbers are nominal. */
const FIT_OVERSIZE = 0.0005;
/** Desktop's `ComponentPresetRowFilter` band; a row must be strictly inside it. */
const matchTolerance = (d: number): number => Math.max(0.05 * d, 0.001);

/** Meters. */
export interface FitContext {
  parentInner?: number;
  /** OD of the motor mount a centering ring holds, a sibling rather than a child. */
  mountOuter?: number;
  /** `getPreviousSymmetricComponent().getAftRadius()`, doubled. */
  foreMatch?: number;
  /** `getNextSymmetricComponent().getForeRadius()`, doubled, or the part ahead of a flipped nose cone. */
  aftMatch?: number;
}

type FitRule = { kind: 'inside'; target: number } | { kind: 'ends'; fore: number | null; aft: number | null };

export function fitRuleFor(type: PickerType, fit: FitContext | undefined): FitRule | null {
  if (!fit) return null;
  switch (type) {
    case 'tubecoupler':
    case 'centeringring':
    case 'bulkhead':
    case 'engineblock':
      return fit.parentInner != null && fit.parentInner > 0 ? { kind: 'inside', target: fit.parentInner } : null;
    // Desktop's "Match fore/aft diameter"; a nose cone's rows state only the aft end.
    case 'bodytube':
    case 'nosecone':
    case 'transition': {
      const fore = type !== 'nosecone' && fit.foreMatch != null ? fit.foreMatch : null;
      const aft = fit.aftMatch != null ? fit.aftMatch : null;
      return fore != null || aft != null ? { kind: 'ends', fore, aft } : null;
    }
    case 'parachute':
      return null;
    // Decided by the motor; scoring OD against the bore would rank a snug sleeve above the mount.
    case 'innertube':
      return null;
    case 'launchlug':
    case 'streamer':
      return null;
    case 'railbutton':
      return null;
  }
}

function outerOf(p: Component): number | null {
  return p.type === 'parachute' ? null : outerDiameterOf(p);
}

function endOf(p: Component, end: 'fore' | 'aft'): number | null {
  switch (p.type) {
    case 'bodytube':
      return p.outerDiameter;
    case 'nosecone':
      return end === 'aft' ? p.outerDiameter : null;
    case 'transition':
      return end === 'fore' ? p.foreOuterDiameter : p.aftOuterDiameter;
    default:
      return null;
  }
}

/** Meters of error; null means not judged, which sorts last. */
export function fitScore(p: Component, rule: FitRule | null): number | null {
  if (!rule) return null;
  const od = outerOf(p);
  if (od == null) return null;
  if (rule.kind === 'inside') {
    // A band, not `od <= target`: far under rattles.
    const gap = rule.target - od;
    return gap >= -FIT_OVERSIZE && gap <= FIT_SLACK ? Math.abs(gap) : null;
  }
  let gap = 0;
  for (const end of ['fore', 'aft'] as const) {
    const target = rule[end];
    if (target == null) continue;
    const v = endOf(p, end);
    if (v == null) continue;
    const off = Math.abs(target - v);
    if (!(off < matchTolerance(target))) return null;
    gap += off;
  }
  return gap;
}

export function boreClears(p: Component, fit: FitContext | undefined): boolean {
  if (p.type !== 'centeringring' || !fit?.mountOuter) return true;
  const id = p.innerDiameter;
  if (id == null) return true;
  const gap = id - fit.mountOuter;
  return gap >= -FIT_OVERSIZE && gap <= FIT_SLACK;
}

// First match wins: "Carbon fiber" and "Fiberglass" both contain "fiber"; "PML glassed phenolic" is phenolic.
const MATERIAL_FAMILIES: [RegExp, string][] = [
  [/phenolic/i, 'Phenolic'],
  [/fiberglass/i, 'Fiberglass'],
  [/carbon/i, 'Carbon fiber'],
  [/plywood|\bli(?:gh)?te?\s*ply\b/i, 'Plywood'],
  [/^birch\b/i, 'Birch'],
  [/balsa/i, 'Balsa'],
  [/paper|cardboard|glassine/i, 'Paper'],
  [/foam/i, 'Foam'],
  [
    /mylar|polycarbonate|polyethylene|polypropylene|polystyrene|polymer|urethane|acrylic|nylon|delrin|acetal|plastic/i,
    'Plastic',
  ],
  [/fiber/i, 'Fiber'],
  [/aluminum|brass|copper|steel|titanium/i, 'Metal'],
];

/** Deliberately untranslated, to match the catalog's English material names beside it. */
export function materialFamily(p: Component): string | null {
  const name = 'material' in p ? p.material : undefined;
  if (!name) return null;
  for (const [re, family] of MATERIAL_FAMILIES) if (re.test(name)) return family;
  return null;
}

export type SortKey = 'fit' | 'mfr' | 'partNo' | 'od' | 'id' | 'length' | 'shape' | 'cd' | 'fore' | 'width';

export interface ComponentQuery {
  text: string;
  mfr: string;
  material: string;
  shape: string;
  /** Meters. */
  odMin: number | null;
  odMax: number | null;
  fitsOnly: boolean;
  showLegacy: boolean;
  sort: SortKey;
  dir: 1 | -1;
}

export const emptyQuery: ComponentQuery = {
  text: '',
  mfr: '',
  material: '',
  shape: '',
  odMin: null,
  odMax: null,
  fitsOnly: false,
  showLegacy: false,
  sort: 'fit',
  dir: 1,
};

export const queryIsEmpty = (q: ComponentQuery): boolean =>
  !q.text.trim() && !q.mfr && !q.material && !q.shape && q.odMin == null && q.odMax == null && !q.fitsOnly;

const textMatches = (p: Component, terms: string[]): boolean => {
  if (terms.length === 0) return true;
  const mat = 'material' in p ? (p.material ?? '') : '';
  const hay = `${p.mfr} ${p.partNo} ${p.desc} ${mat}`.toLowerCase();
  return terms.every((term) => hay.includes(term));
};

function sortValue(p: Component, key: SortKey): string | number | null {
  switch (key) {
    case 'mfr':
      return p.mfr.toLowerCase();
    case 'partNo':
      return p.partNo.toLowerCase();
    case 'od':
      return outerDiameterOf(p);
    case 'id':
      return 'innerDiameter' in p ? p.innerDiameter : null;
    case 'length':
      return lengthOf(p);
    case 'shape':
      return 'shape' in p ? p.shape : null;
    case 'cd':
      return p.type === 'parachute' ? (p.cd ?? KERNEL_DEFAULTS.parachute.cd) : null;
    case 'fore':
      return p.type === 'transition' ? p.foreOuterDiameter : null;
    case 'width':
      return p.type === 'streamer' ? p.stripWidth : null;
    case 'fit':
      return null;
  }
}

export interface Ranked<C extends Component> {
  part: C;
  fit: number | null;
}

export function queryComponents<C extends Component>(
  list: C[],
  q: ComponentQuery,
  type: PickerType,
  fit?: FitContext,
): Ranked<C>[] {
  const terms = q.text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rule = fitRuleFor(type, fit);

  const rows: Ranked<C>[] = [];
  for (const part of list) {
    if (part.legacy && !q.showLegacy) continue;
    if (!textMatches(part, terms)) continue;
    if (q.mfr && part.mfr !== q.mfr) continue;
    if (q.material && materialFamily(part) !== q.material) continue;
    if (q.shape && !('shape' in part && part.shape === q.shape)) continue;
    const od = outerDiameterOf(part);
    if (q.odMin != null && (od == null || od < q.odMin)) continue;
    if (q.odMax != null && (od == null || od > q.odMax)) continue;
    const score = boreClears(part, fit) ? fitScore(part, rule) : null;
    if (q.fitsOnly && score == null) continue;
    rows.push({ part, fit: score });
  }

  const cmp = (a: Ranked<C>, b: Ranked<C>): number => {
    // Saved parts first under every sort, or the capped window could hide them.
    if (!!a.part.custom !== !!b.part.custom) return a.part.custom ? -1 : 1;
    if (q.sort === 'fit') {
      // Unscored rows go last in either direction: unranked, not worst.
      if (a.fit == null && b.fit == null) return a.part.mfr.localeCompare(b.part.mfr);
      if (a.fit == null) return 1;
      if (b.fit == null) return -1;
      return (a.fit - b.fit) * q.dir;
    }
    return compareSortKeys(sortValue(a.part, q.sort), sortValue(b.part, q.sort), q.dir);
  };
  return rows.sort(cmp);
}

export const manufacturers = (list: Component[]): string[] => distinctSorted(list, (p) => p.mfr);

export const materialFamilies = (list: Component[]): string[] => distinctSorted(list, materialFamily);

export const noseShapes = (list: Component[]): string[] =>
  distinctSorted(list, (p) => ('shape' in p ? p.shape : undefined));

// Lookbehind, not `\b`, so it strips the `mm` in `29mm` but leaves `MMT` and `lines` intact.
const UNIT_WORDS =
  /(?<=[\d\s]|^)(?:mm|cm|m|in|inch|inches|ft|len|length|long|dia|diameter|od|id|thick|thickness|wide|width|to|x|by)\b/gi;
const FIGURES = /[\d.,/\-–×"'()\s]+/g;

function isDimensional(s: string): boolean {
  return s.replace(UNIT_WORDS, ' ').replace(FIGURES, ' ').trim() === '';
}

const TYPE_WORDS: Record<ComponentType, RegExp> = {
  bodytube: /^body\s*tubes?$/i,
  nosecone: /^nose\s*cones?$/i,
  parachute: /^parachutes?$/i,
  tubecoupler: /^(tube\s*)?couplers?$/i,
  centeringring: /^centering\s*rings?$/i,
  bulkhead: /^bulk\s*heads?$/i,
  transition: /^transitions?$/i,
  engineblock: /^engine\s*blocks?$/i,
  launchlug: /^launch\s*lugs?$/i,
  streamer: /^streamers?$/i,
  railbutton: /^rail\s*buttons?$/i,
};

export function describeNotes(p: Component): string {
  const typeWords = TYPE_WORDS[p.type];
  const bare = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const pns = p.partNo.split(',').map(bare).filter(Boolean);
  const shape = 'shape' in p ? p.shape.toLowerCase() : null;
  return p.desc
    .split(',')
    .map((seg) => seg.trim())
    .filter((seg, i) => {
      if (!seg) return false;
      if (isDimensional(seg)) return false;
      if (i === 0 && typeWords.test(seg)) return false;
      if (pns.length > 0 && /^p\/?n[\s:]/i.test(seg)) {
        // A `PN` naming an identifier the field lacks is kept as real information.
        const pieces = seg
          .replace(/^p\/?n[\s:]*/i, '')
          .split('/')
          .map(bare)
          .filter(Boolean);
        if (pieces.length > 0 && pieces.every((piece) => pns.includes(piece))) return false;
      }
      if (shape && seg.toLowerCase() === shape) return false;
      return true;
    })
    .join(' · ');
}
