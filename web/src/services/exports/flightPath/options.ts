export type WaypointKind =
  'pad' | 'liftoff' | 'burnout' | 'apogee' | 'recovery' | 'landing' | 'maxvelocity' | 'maxacceleration';

/** Display and emit order, matching the reference enum. */
export const WAYPOINT_KINDS: WaypointKind[] = [
  'pad',
  'liftoff',
  'burnout',
  'apogee',
  'recovery',
  'landing',
  'maxvelocity',
  'maxacceleration',
];

export type DistanceUnit = 'm' | 'ft' | 'km' | 'mi';

export type Translate = (key: string, vars?: Record<string, unknown>) => string;

export const WAYPOINT_LABEL_KEY: Record<WaypointKind, string> = {
  pad: 'pathExport.wp.pad',
  liftoff: 'pathExport.wp.liftoff',
  burnout: 'pathExport.wp.burnout',
  apogee: 'pathExport.wp.apogee',
  recovery: 'pathExport.wp.recovery',
  landing: 'pathExport.wp.landing',
  maxvelocity: 'pathExport.wp.maxVelocity',
  maxacceleration: 'pathExport.wp.maxAcceleration',
};

export type AltitudeReference = 'automatic' | 'ground' | 'sealevel' | 'clamped';

export type StageTrackStart = 'separation' | 'pad';

/** A launch altitude of zero is the default, so it cannot place the flight at true elevation. */
export function resolveAltitudeReference(
  reference: AltitudeReference,
  launchAltitudeMeters: number,
): Exclude<AltitudeReference, 'automatic'> {
  if (reference !== 'automatic') return reference;
  return launchAltitudeMeters !== 0 && Number.isFinite(launchAltitudeMeters) ? 'sealevel' : 'ground';
}

export interface FlightPathExportOptions {
  waypoints: Set<WaypointKind>;
  includeFlightPath: boolean;
  includeGroundTrack: boolean;
  /** Keep every Nth sampled path point (1 = keep all). */
  pathStride: number;
  altitudeUnit: DistanceUnit;
  distanceUnit: DistanceUnit;
  altitudeReference: AltitudeReference;
  waypointAltitudeReference: AltitudeReference;
  drawShadow: boolean;
  stageTrackStart: StageTrackStart;
  showWaypointLabels: boolean;
  colorWaypointPins: boolean;
  includeDescriptions: boolean;
  /** '' follows the app. */
  language: string;
  missionName: string;
  labelWaypointsWithMission: boolean;
  /** Sparse, keyed by branch index; likewise the ground and pin maps. */
  branchColors: Map<number, number>;
  branchGroundColors: Map<number, number>;
  branchPinColors: Map<number, number>;
}

export function asWaypointKinds(values: readonly string[] | undefined): Set<WaypointKind> | undefined {
  if (!values) return undefined;
  const legal = new Set<string>(WAYPOINT_KINDS);
  return new Set(values.filter((v): v is WaypointKind => legal.has(v)));
}

export function asDistanceUnit(value: string | undefined): DistanceUnit | undefined {
  return value === 'm' || value === 'ft' || value === 'km' || value === 'mi' ? value : undefined;
}

export function asAltitudeReference(value: string | undefined): AltitudeReference | undefined {
  return value === 'automatic' || value === 'ground' || value === 'sealevel' || value === 'clamped' ? value : undefined;
}

export function asStageTrackStart(value: string | undefined): StageTrackStart | undefined {
  return value === 'separation' || value === 'pad' ? value : undefined;
}

export function defaultExportOptions(preferred?: string): FlightPathExportOptions {
  const unit: DistanceUnit = preferred === 'ft' || preferred === 'km' || preferred === 'mi' ? preferred : 'm';
  return {
    waypoints: new Set(WAYPOINT_KINDS),
    includeFlightPath: true,
    includeGroundTrack: true,
    pathStride: 1,
    altitudeUnit: unit,
    distanceUnit: unit,
    altitudeReference: 'automatic',
    waypointAltitudeReference: 'automatic',
    drawShadow: false,
    stageTrackStart: 'separation',
    showWaypointLabels: true,
    colorWaypointPins: true,
    includeDescriptions: true,
    language: '',
    // Not persisted: a leftover mission name would silently mislabel the next export.
    missionName: '',
    labelWaypointsWithMission: false,
    branchColors: new Map(),
    branchGroundColors: new Map(),
    branchPinColors: new Map(),
  };
}
