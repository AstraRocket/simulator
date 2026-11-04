import type { WaypointKind } from './options';

export interface FlightPathWaypoint {
  type: WaypointKind;
  label: string;
  device: string;
  latitude: number;
  longitude: number;
  latitudeStr: string;
  longitudeStr: string;
  altitudeMslMeters: number;
  altitudeAglMeters: number;
  /** In `model.kmlWaypointAltitudeMode`. */
  altitudeKmlMeters: number;
  time: number;
  timeStr: string;
  timeText: string;
  altitude: string; // above the pad, display unit
  altitudeMsl: string; // above sea level, display unit
  distance: string; // horizontal distance from pad, display unit
  bearing: string; // compass degrees from pad
  rangeText: string;
  qualifiedLabel: string;
  branchName: string;
}

export interface FlightPathPoint {
  latitude: number;
  longitude: number;
  altitudeMslMeters: number;
  altitudeAglMeters: number;
  /** In `model.kmlAltitudeMode`. */
  altitudeKmlMeters: number;
  time: number;
  timeStr: string;
  altitude: string;
}

export interface FlightPathBranch {
  name: string;
  /** Zero-based and contiguous, for unique style ids. */
  index: number;
  /** Saved templates reference these keys by name; do not rename. */
  colorRgb: string;
  groundColorRgb: string;
  pinColorRgb: string;
  pathColorKml: string;
  groundColorKml: string;
  pinColorKml: string;
  csvPinColor: string;
  waypointStyled: boolean;
  waypoints: FlightPathWaypoint[];
  path: FlightPathPoint[];
  hasPath: boolean;
  hasWaypoints: boolean;
  /** Scanned over the whole branch including the shared ascent, unlike peak waypoints. */
  maxRangeMeters: number;
  maxRange: string;
  /** False on time limit or abort; the last sample could be mid-climb. */
  hasLanding: boolean;
  landingDistance: string;
  landingBearing: string;
  landingTime: string;
  landingLatitudeStr: string;
  landingLongitudeStr: string;
  landingText: string;
  landingHeading: string;
}

export interface FlightPathModel {
  title: string;
  rocketName: string;
  simulationName: string;
  motor: string;
  configuration: string;
  launchLatitude: number;
  launchLongitude: number;
  launchAltitudeMeters: number;
  launchLatitudeStr: string;
  launchLongitudeStr: string;
  launchAltitude: string;
  altitudeUnit: string;
  distanceUnit: string;
  velocityUnit: string;
  accelerationUnit: string;
  includeFlightPath: boolean;
  includeGroundTrack: boolean;
  kmlAltitudeMode: string;
  kmlWaypointAltitudeMode: string;
  /** Mustache sections, not values, so an older template renders nothing. */
  extrudePath: boolean;
  extrudeWaypoints: boolean;
  /** KML honors `<tessellate>` only on clamped lines. */
  tessellatePath: boolean;
  showWaypointLabels: boolean;
  colorWaypointPins: boolean;
  maxAltitude: string;
  maxVelocity: string;
  maxAcceleration: string;
  /** Maximum horizontal distance, not the landing distance. */
  maxRange: string;
  timeToApogee: string;
  flightTime: string;
  includeDescriptions: boolean;
  labels: Record<string, string>;
  branches: FlightPathBranch[];
}

export interface FlightPathMeta {
  simName: string;
  rocketName: string;
  motorName: string;
}
