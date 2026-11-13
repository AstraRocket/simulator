import type { ComponentType } from '../../engine/openRocketEngine';

/** Desktop's English name for a new part: what every writer saves for a part the user never named. */
export const DESKTOP_PART_NAMES: Readonly<Partial<Record<ComponentType, string>>> = {
  nosecone: 'Nose Cone',
  transition: 'Transition',
  bodytube: 'Body Tube',
  trapezoidfinset: 'Trapezoidal Fin Set',
  ellipticalfinset: 'Elliptical Fin Set',
  freeformfinset: 'Freeform Fin Set',
  tubefinset: 'Tube Fin Set',
  innertube: 'Inner Tube',
  tubecoupler: 'Tube Coupler',
  centeringring: 'Centering Ring',
  bulkhead: 'Bulkhead',
  engineblock: 'Engine Block',
  launchlug: 'Launch Lug',
  railbutton: 'Rail Button',
  parachute: 'Parachute',
  streamer: 'Streamer',
  shockcord: 'Shock Cord',
  masscomponent: 'Mass Component',
  podset: 'Pod set',
  parallelstage: 'Booster',
};
