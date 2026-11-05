import type { ComponentType } from '../engine/openRocketEngine';

/** Only for contexts with no translator; UI uses `t('part.' + node.type)`. */
export const DISPLAY_NAME: Record<ComponentType, string> = {
  stage: 'Stage',
  nosecone: 'Nose cone',
  transition: 'Transition',
  bodytube: 'Body tube',
  trapezoidfinset: 'Trapezoidal fins',
  ellipticalfinset: 'Elliptical fins',
  freeformfinset: 'Freeform fins',
  tubefinset: 'Tube fins',
  innertube: 'Inner tube',
  tubecoupler: 'Tube coupler',
  centeringring: 'Centering ring',
  bulkhead: 'Bulkhead',
  engineblock: 'Engine block',
  launchlug: 'Launch lug',
  railbutton: 'Rail button',
  parachute: 'Parachute',
  streamer: 'Streamer',
  shockcord: 'Shock cord',
  masscomponent: 'Mass component',
  fairing: 'Camera shroud / fairing',
  podset: 'Pod set',
  parallelstage: 'Booster (parallel stage)',
};
