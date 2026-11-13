import type { ComponentType } from '../engine/openRocketEngine';

/** `SymmetricComponent.DEFAULT_RADIUS` (m). */
export const KERNEL_AUTO_RADIUS = 0.025;

/**
 * `ComponentFactory`'s defaults for a missing key; every TS fallback reads from here or the drawing and
 * simulation diverge. `kernelDefaults.kernel.test.ts` verifies each row.
 */
export const KERNEL_DEFAULTS = {
  stage: {},
  nosecone: { length: 0.15, aftRadius: 0.025, thickness: 0.002 },
  transition: { length: 0.075, thickness: 0.002 },
  bodytube: { length: 0.2, outerRadius: 0.025, thickness: 0.002 },
  trapezoidfinset: { finCount: 3, rootChord: 0.05, tipChord: 0.05, sweep: 0.025, height: 0.03, thickness: 0.003 },
  ellipticalfinset: { finCount: 3, rootChord: 0.05, height: 0.05, thickness: 0.003 },
  freeformfinset: { finCount: 3, thickness: 0.003 },
  tubefinset: { finCount: 6, length: 0.1 },
  innertube: { length: 0.07, outerRadius: 0.0095, thickness: 0.0005 },
  tubecoupler: { length: 0.06, thickness: 0.002 },
  centeringring: { length: 0.002, instanceCount: 1 },
  bulkhead: { length: 0.002, instanceCount: 1 },
  engineblock: { length: 0.005, thickness: 0.005 },
  // Separation is the constructor's (LaunchLug.java:38), set before the length, so it does not follow it.
  launchlug: {
    length: 0.03,
    outerRadius: 0.005,
    thickness: 0.001,
    instanceCount: 1,
    instanceSeparation: 0.06,
    angleOffset: Math.PI,
  },
  // No `length`: a rail button's axial length stays 0 (RocketComponent.java:91). Separation set before the diameter.
  railbutton: { outerDiameter: 0.0097, instanceCount: 1, instanceSeparation: 0.0582, angleOffset: Math.PI },
  fairing: { length: 0.08, mass: 0.03, width: 0.025, height: 0.02 },
  parachute: { length: 0.025, diameter: 0.3, lineLength: 0.3, cd: 0.8, lineCount: 6, radius: 0.0125 },
  streamer: { length: 0.025, stripLength: 0.5, stripWidth: 0.05, radius: 0.0125 },
  shockcord: { length: 0.025, cordLength: 0.4, radius: 0.0125 },
  masscomponent: { mass: 0, length: 0.025, radius: 0.0125 },
  podset: { instanceCount: 2 },
  parallelstage: { instanceCount: 2 },
} as const satisfies Record<ComponentType, Readonly<Record<string, number>>>;

/** `FreeformFinSet()`'s outline, which the bridge flies when a fin set has no `points`. */
export const KERNEL_FREEFORM_POINTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.025, 0.05],
  [0.075, 0.05],
  [0.05, 0],
];

export function defaultSeparation(type: string): number {
  const row = (KERNEL_DEFAULTS as Record<string, { instanceSeparation?: number }>)[type];
  return row?.instanceSeparation ?? 0;
}

/** Kennedy Space Center, the kernel's default site (`OpenRocketEngine.simulateJson`), in degrees. */
export const KERNEL_LAUNCH_SITE = { latitudeDeg: 28.61, longitudeDeg: -80.6 } as const;

/** Names `ComponentFactory.finishOf` accepts, in desktop's `Finish` enum order. */
export const KERNEL_FINISHES: readonly string[] = [
  'rough',
  'roughunfinished',
  'unfinished',
  'normal',
  'smooth',
  'optimum',
  'polished',
  'finishpolished',
  'mirror',
];

export const KERNEL_SHAPES = {
  nosecone: 'ogive',
  transition: 'conical',
} as const;

/**
 * `group` is the `.ork` database string, not the catalog's display group (Cardboard is `PaperProducts`, not `Paper`).
 * `shearModulus` (Pa) is Cardboard's in `Databases.java`; the defaults come from that list, so they carry it.
 */
export const KERNEL_MATERIALS = {
  bulk: { name: 'Cardboard', density: 680, shearModulus: 0.4e9, group: 'PaperProducts' },
  surface: { name: 'Ripstop nylon', density: 0.067, group: 'Fabrics' },
  line: { name: 'Elastic cord (round 2 mm, 1/16 in)', density: 0.0018, group: 'ThreadsLines' },
} as const satisfies Record<string, { name: string; density: number; shearModulus?: number; group: string }>;

export function kernelLength(type: ComponentType): number | undefined {
  return kernelDefault(type, 'length');
}

export function kernelDefault(type: string, key: string): number | undefined {
  const row = (KERNEL_DEFAULTS as Record<string, Readonly<Record<string, number>> | undefined>)[type];
  return row?.[key];
}

export const KERNEL_RAILBUTTON_OUTER_DIAMETER = KERNEL_DEFAULTS.railbutton.outerDiameter;

export const KERNEL_BODYTUBE_OUTER_RADIUS = KERNEL_DEFAULTS.bodytube.outerRadius;

/** The trapezoid defaults; elliptical `height` differs (0.05, its own row). */
export const FIN_DEFAULTS = {
  rootChord: KERNEL_DEFAULTS.trapezoidfinset.rootChord,
  tipChord: KERNEL_DEFAULTS.trapezoidfinset.tipChord,
  sweep: KERNEL_DEFAULTS.trapezoidfinset.sweep,
  height: KERNEL_DEFAULTS.trapezoidfinset.height,
  thickness: KERNEL_DEFAULTS.trapezoidfinset.thickness,
} as const;

/** `DeploymentConfiguration`'s field initializers. */
export const KERNEL_DEPLOYMENT = { deployEvent: 'ejection', deployAltitude: 200, deployDelay: 0 } as const;

/** `StageSeparationConfiguration`'s field initializers. */
export const KERNEL_SEPARATION = { separationEvent: 'ejection', separationAltitude: 200, separationDelay: 0 } as const;
