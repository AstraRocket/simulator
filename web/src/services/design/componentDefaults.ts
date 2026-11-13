import { KERNEL_DEFAULTS } from '../../tree/kernelDefaults';

// File services must read fallbacks from here, never a local literal, or parts drift in size.
export const COMPONENT_DEFAULTS = {
  nosecone: {
    length: KERNEL_DEFAULTS.nosecone.length,
    thickness: KERNEL_DEFAULTS.nosecone.thickness,
    aftRadius: KERNEL_DEFAULTS.nosecone.aftRadius,
  },
  transition: {
    length: KERNEL_DEFAULTS.transition.length,
    thickness: KERNEL_DEFAULTS.transition.thickness,
  },
  bodytube: {
    length: KERNEL_DEFAULTS.bodytube.length,
    outerRadius: KERNEL_DEFAULTS.bodytube.outerRadius,
    thickness: KERNEL_DEFAULTS.bodytube.thickness,
  },
  innertube: {
    length: KERNEL_DEFAULTS.innertube.length,
    outerRadius: KERNEL_DEFAULTS.innertube.outerRadius,
    thickness: KERNEL_DEFAULTS.innertube.thickness,
  },
  tubecoupler: {
    length: KERNEL_DEFAULTS.tubecoupler.length,
    thickness: KERNEL_DEFAULTS.tubecoupler.thickness,
  },
  engineblock: {
    length: KERNEL_DEFAULTS.engineblock.length,
    thickness: KERNEL_DEFAULTS.engineblock.thickness,
  },
  centeringring: {
    length: KERNEL_DEFAULTS.centeringring.length,
  },
  bulkhead: {
    length: KERNEL_DEFAULTS.bulkhead.length,
  },
  finset: {
    finCount: KERNEL_DEFAULTS.trapezoidfinset.finCount,
    thickness: KERNEL_DEFAULTS.trapezoidfinset.thickness,
  },
  trapezoidfinset: {
    rootChord: KERNEL_DEFAULTS.trapezoidfinset.rootChord,
    tipChord: KERNEL_DEFAULTS.trapezoidfinset.tipChord,
    sweep: KERNEL_DEFAULTS.trapezoidfinset.sweep,
    height: KERNEL_DEFAULTS.trapezoidfinset.height,
  },
  ellipticalfinset: {
    rootChord: KERNEL_DEFAULTS.ellipticalfinset.rootChord,
    height: KERNEL_DEFAULTS.ellipticalfinset.height,
  },
  // No wall: it inherits the parent tube's (ComponentFactory.applyWallThickness).
  tubefinset: {
    finCount: KERNEL_DEFAULTS.tubefinset.finCount,
    length: KERNEL_DEFAULTS.tubefinset.length,
  },
  launchlug: {
    length: KERNEL_DEFAULTS.launchlug.length,
    outerRadius: KERNEL_DEFAULTS.launchlug.outerRadius,
    thickness: KERNEL_DEFAULTS.launchlug.thickness,
  },
  railbutton: {
    outerDiameter: KERNEL_DEFAULTS.railbutton.outerDiameter,
    // RailButton() (rocketcomponent/RailButton.java:60-66).
    innerDiameter: 0.008,
    height: 0.0097,
    baseHeight: 0.002,
    flangeHeight: 0.002,
    screwHeight: 0,
    materialName: 'Delrin',
    materialDensity: 1420,
    // Delrin's in `Databases.java`.
    materialShearModulus: 0.946e9,
    materialGroup: 'Plastics',
  },
  parachute: {
    diameter: KERNEL_DEFAULTS.parachute.diameter,
    lineCount: KERNEL_DEFAULTS.parachute.lineCount,
    lineLength: KERNEL_DEFAULTS.parachute.lineLength,
  },
  streamer: {
    stripLength: KERNEL_DEFAULTS.streamer.stripLength,
    stripWidth: KERNEL_DEFAULTS.streamer.stripWidth,
  },
  shockcord: {
    cordLength: KERNEL_DEFAULTS.shockcord.cordLength,
  },
  masscomponent: {
    mass: KERNEL_DEFAULTS.masscomponent.mass,
    length: KERNEL_DEFAULTS.masscomponent.length,
    radius: KERNEL_DEFAULTS.masscomponent.radius,
  },
  fairing: {
    length: KERNEL_DEFAULTS.fairing.length,
    width: KERNEL_DEFAULTS.fairing.width,
    height: KERNEL_DEFAULTS.fairing.height,
    mass: KERNEL_DEFAULTS.fairing.mass,
  },
  recovery: {
    packedLength: KERNEL_DEFAULTS.parachute.length,
    packedRadius: KERNEL_DEFAULTS.parachute.radius,
  },
} as const;
