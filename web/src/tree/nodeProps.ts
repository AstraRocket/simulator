import type { ComponentNode, ComponentPosition } from '../engine/openRocketEngine';
import { KERNEL_AUTO_RADIUS, KERNEL_BODYTUBE_OUTER_RADIUS, KERNEL_DEFAULTS } from './kernelDefaults';
import { degToRad } from '../prefs/units';

/** Rejects non-finite values: a malformed file's NaN would reach every geometry path. */
/** An inner tube's outer radius; keyless, `InnerTube()`'s 19 mm tube. */
export const innerTubeRadius = (n: ComponentNode): number =>
  num(n, 'outerRadius', KERNEL_DEFAULTS.innertube.outerRadius);

export const num = (n: ComponentNode, key: string, fb = 0): number =>
  typeof n[key] === 'number' && Number.isFinite(n[key]) ? n[key] : fb;

export const numOpt = (n: ComponentNode, key: string): number | undefined =>
  typeof n[key] === 'number' && Number.isFinite(n[key]) ? n[key] : undefined;

/** Renderers allocate per instance, so a typo of 100000 would lock the tab. */
export const MAX_INSTANCE_COUNT = 64;

/** `ComponentFactory.MAX_LINE_COUNT`. */
export const MAX_LINE_COUNT = 1024;

/** `FinSet.setFinCount`'s clamp; the engine rejects more. */
export const MAX_FIN_COUNT = 8;

/** `FinSet.setCantAngle` clamps to 15 deg (rad). */
export const MAX_CANT = degToRad(15);

export const finCant = (node: ComponentNode): number => Math.max(-MAX_CANT, Math.min(MAX_CANT, num(node, 'cant', 0)));

export const countOf = (n: ComponentNode, key: string, fb: number): number =>
  Math.min(MAX_INSTANCE_COUNT, Math.max(1, Math.round(num(n, key, fb))));

export const str = (n: ComponentNode, key: string, fb = ''): string => (typeof n[key] === 'string' ? n[key] : fb);

export const bool = (n: ComponentNode, key: string, fb = false): boolean => (typeof n[key] === 'boolean' ? n[key] : fb);

export const chainOuterRadius = (n: ComponentNode): number => {
  if (n.type === 'nosecone') return noseConeAftRadius(n);
  if (n.type === 'bodytube') return bodyTubeRadius(n);
  if (n.type === 'transition') return transitionOuterRadius(n);
  return 0;
};

/** `Transition()` starts both ends at 25 mm. */
export const transitionRadii = (n: ComponentNode): { fore: number; aft: number } => ({
  fore: num(n, 'foreRadius', KERNEL_AUTO_RADIUS),
  aft: num(n, 'aftRadius', KERNEL_AUTO_RADIUS),
});

export const transitionOuterRadius = (n: ComponentNode): number => {
  const { fore, aft } = transitionRadii(n);
  return Math.max(fore, aft);
};

export const bodyTubeRadius = (n: ComponentNode): number => num(n, 'outerRadius', KERNEL_BODYTUBE_OUTER_RADIUS);

export const noseConeAftRadius = (n: ComponentNode): number => num(n, 'aftRadius', KERNEL_DEFAULTS.nosecone.aftRadius);

export const anyOuterRadius = (n: ComponentNode): number => {
  if (n.type === 'transition') return Math.max(transitionOuterRadius(n), num(n, 'outerRadius', 0));
  return Math.max(
    n.type === 'nosecone' ? noseConeAftRadius(n) : num(n, 'aftRadius', 0),
    num(n, 'outerRadius', 0),
    num(n, 'foreRadius', 0),
  );
};

const AXIAL_METHODS: ReadonlySet<string> = new Set<ComponentPosition['method']>([
  'top',
  'middle',
  'bottom',
  'absolute',
  'after',
]);

/** The Java constructor's axial method, kept when the node has no `position`. Unlisted types default to `TOP`. */
const CONSTRUCTOR_METHOD: Readonly<Record<string, ComponentPosition['method']>> = {
  trapezoidfinset: 'bottom',
  ellipticalfinset: 'bottom',
  freeformfinset: 'bottom',
  tubefinset: 'bottom',
  innertube: 'bottom',
  tubecoupler: 'bottom',
  centeringring: 'bottom',
  bulkhead: 'bottom',
  engineblock: 'bottom',
  podset: 'bottom',
  parallelstage: 'bottom',
  launchlug: 'middle',
  railbutton: 'middle',
};

/** For a `position` with no valid method: `applyAssembly` reads `bottom`, `create` reads `top`. */
const statedMethodDefault = (type: string): ComponentPosition['method'] =>
  type === 'podset' || type === 'parallelstage' ? 'bottom' : 'top';

/** Not a cast: `offset: "0.1"` from a hostile `.ork` would produce a string station. */
export const positionOf = (n: ComponentNode): ComponentPosition => {
  const raw = n.position as Partial<ComponentPosition> | null | undefined;
  const fallback = raw ? statedMethodDefault(n.type) : (CONSTRUCTOR_METHOD[n.type] ?? 'top');
  // Lowercased: desktop's AxialMethod names read either way.
  const stated = raw && typeof raw.method === 'string' ? raw.method.toLowerCase() : '';
  const method = AXIAL_METHODS.has(stated) ? (stated as ComponentPosition['method']) : fallback;
  const offset = raw && typeof raw.offset === 'number' && Number.isFinite(raw.offset) ? raw.offset : 0;
  return raw?.ork ? { method, offset, ork: raw.ork } : { method, offset };
};
