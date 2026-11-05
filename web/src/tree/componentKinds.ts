import type { ComponentType } from '../engine/openRocketEngine';

export type ComponentKind =
  | 'stage'
  | 'chain'
  /** OpenRocket's `instanceof FinSet`. */
  | 'planarfin'
  /** `TubeFinSet extends Tube`: no planform. */
  | 'tubefin'
  | 'internal'
  | 'external'
  | 'recovery'
  | 'mass'
  | 'assembly';

export const COMPONENT_KIND = {
  stage: 'stage',
  nosecone: 'chain',
  transition: 'chain',
  bodytube: 'chain',
  trapezoidfinset: 'planarfin',
  ellipticalfinset: 'planarfin',
  freeformfinset: 'planarfin',
  tubefinset: 'tubefin',
  innertube: 'internal',
  tubecoupler: 'internal',
  centeringring: 'internal',
  bulkhead: 'internal',
  engineblock: 'internal',
  launchlug: 'external',
  railbutton: 'external',
  // The kernel models it as a mass component, but it rides on the surface.
  fairing: 'external',
  parachute: 'recovery',
  streamer: 'recovery',
  shockcord: 'recovery',
  masscomponent: 'mass',
  podset: 'assembly',
  parallelstage: 'assembly',
} as const satisfies Record<ComponentType, ComponentKind>;

export type TypesOfKind<K extends ComponentKind> = {
  [T in ComponentType]: (typeof COMPONENT_KIND)[T] extends K ? T : never;
}[ComponentType];

export type ChainType = TypesOfKind<'chain'>;
export type AssemblyType = TypesOfKind<'assembly'>;
export type PlanarFinSetType = TypesOfKind<'planarfin'>;
export type FinSetType = TypesOfKind<'planarfin' | 'tubefin'>;

export function typesOfKind<K extends ComponentKind>(...kinds: K[]): ReadonlySet<TypesOfKind<K>> {
  const wanted = new Set<ComponentKind>(kinds);
  const out = new Set<TypesOfKind<K>>();
  for (const [type, kind] of Object.entries(COMPONENT_KIND) as [ComponentType, ComponentKind][]) {
    if (wanted.has(kind)) out.add(type as TypesOfKind<K>);
  }
  return out;
}

/** Their own `position` is not used for layout. */
export const CHAIN_TYPES: ReadonlySet<ChainType> = typesOfKind('chain');

export const ASSEMBLY_TYPES: ReadonlySet<AssemblyType> = typesOfKind('assembly');

export const PLANAR_FIN_TYPES: ReadonlySet<PlanarFinSetType> = typesOfKind('planarfin');

export const FIN_SET_TYPES: ReadonlySet<FinSetType> = typesOfKind('planarfin', 'tubefin');

export const MASS_OBJECT_TYPES: ReadonlySet<TypesOfKind<'recovery' | 'mass'>> = typesOfKind('recovery', 'mass');

/** The kernel's `ExternalComponent`s. A fairing is not one: it is built as a mass component. */
export const EXTERNAL_COMPONENT_TYPES: ReadonlySet<ComponentType> = new Set<ComponentType>([
  ...CHAIN_TYPES,
  ...FIN_SET_TYPES,
  'launchlug',
  'railbutton',
]);

export const isChainType = (type: string): type is ChainType => (CHAIN_TYPES as ReadonlySet<string>).has(type);

/** Roll is in radians. */
export function rollAngleKey(type: string): 'rotation' | 'angleOffset' | undefined {
  if ((FIN_SET_TYPES as ReadonlySet<string>).has(type)) return 'rotation';
  if (type === 'launchlug' || type === 'railbutton' || (ASSEMBLY_TYPES as ReadonlySet<string>).has(type)) {
    return 'angleOffset';
  }
  return undefined;
}

/** Defaults as `ComponentFactory`: pi for lugs and rail buttons, else 0. Unclamped. */
export function rollAngleOf(node: { type: string; [key: string]: unknown }): number | undefined {
  const key = rollAngleKey(node.type);
  if (!key) return undefined;
  const v = node[key];
  if (typeof v === 'number') return v;
  return node.type === 'launchlug' || node.type === 'railbutton' ? Math.PI : 0;
}
