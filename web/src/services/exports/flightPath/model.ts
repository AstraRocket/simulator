import type { WaypointKind } from './options';

// ---------------------------------------------------------------------------
// Model (format-agnostic, mirrors FlightPathModel)
// ---------------------------------------------------------------------------

export interface FlightPathWaypoint {
  type: WaypointKind;
  label: string;
  device: string;
  latitude: number;
  longitude: number;
  latitudeStr: string;
  longitudeStr: string;
  /** Altitude above sea level, in meters. GPX elevations are defined this way. */
  altitudeMslMeters: number;
  /** Altitude above the ground, in meters. */
  altitudeAglMeters: number;
  /** The altitude to write into a KML coordinate, in `model.kmlWaypointAltitudeMode`. */
  altitudeKmlMeters: number;
  time: number;
  /** The precise event time, to hundredths. What a template should read. */
  timeStr: string;
  /**
   * The same moment to one decimal, which is what the balloons print.
   *
   * A balloon saying `T+1.00 s` beside a landing saying `T+2.0 s` gives one
   * quantity two notations in one file. One decimal is the one that matches the
   * time to apogee and the flight time already in the document balloon, and it
   * is as much as a balloon has any use for; `timeStr` keeps the precision for
   * anything that wants it.
   */
  timeText: string;
  altitude: string; // above the pad, display unit
  altitudeMsl: string; // above sea level, display unit
  distance: string; // horizontal distance from pad, display unit
  bearing: string; // compass degrees from pad
  /**
   * "111.8 m at 27°" in the export language, distance unit included.
   *
   * Composed here rather than glued together in the template: the preposition
   * and the word order differ by language, and a template writing
   * `{{distance}} {{unit}} {{labels.at}} {{bearing}}` would hold every language
   * to English word order. The parts are all still on the model for a template
   * that wants to build its own.
   */
  rangeText: string;
  /** `label` qualified with its stage, e.g. "Booster Apogee". Same as `label`
   *  for a single-branch flight. */
  qualifiedLabel: string;
  /** Name of the flight branch (stage) this waypoint belongs to. */
  branchName: string;
}

export interface FlightPathPoint {
  latitude: number;
  longitude: number;
  /** Altitude above sea level, in meters. GPX elevations are defined this way. */
  altitudeMslMeters: number;
  /** Altitude above the ground, in meters. */
  altitudeAglMeters: number;
  /** The altitude to write into a KML coordinate, in `model.kmlAltitudeMode`. */
  altitudeKmlMeters: number;
  time: number;
  timeStr: string;
  altitude: string;
}

export interface FlightPathBranch {
  name: string;
  /** Zero-based position in `model.branches`, for building unique style ids. */
  index: number;
  /**
   * This branch's flight-path color as RRGGBB. Templates reference this key by
   * name, so renaming it stops saved templates rendering.
   */
  colorRgb: string;
  /** This branch's ground-track color as RRGGBB. */
  groundColorRgb: string;
  /** This branch's waypoint-pin color as RRGGBB. */
  pinColorRgb: string;
  /** The flight-path color as an opaque KML aabbggrr literal. */
  pathColorKml: string;
  /** The ground-track color as an opaque KML aabbggrr literal. */
  groundColorKml: string;
  /** The waypoint-pin color as an opaque KML aabbggrr literal. */
  pinColorKml: string;
  /**
   * The CSV `color` column: the stage's pin color as `#RRGGBB` when pins are
   * colored, else `yellow`. A map
   * importer reads it, so pins match the KML's per-stage colors.
   */
  csvPinColor: string;
  /**
   * Whether this stage's waypoint `<Style>` carries anything: a pin color, or
   * hidden labels. With neither it would be an empty element every waypoint
   * points at, so the style and the `styleUrl` are both left out.
   */
  waypointStyled: boolean;
  waypoints: FlightPathWaypoint[];
  path: FlightPathPoint[];
  /** Template convenience (mirrors the desktop model's methods). */
  hasPath: boolean;
  hasWaypoints: boolean;
  /**
   * The farthest this stage got from the pad, horizontally, in meters.
   *
   * Scanned over the whole branch, including the ascent the stages flew bolted
   * together before separation, because the stack's excursion counts against
   * every stage that was part of it. That is unlike the peak velocity and peak
   * acceleration waypoints, which are scanned from the separation point so a
   * spent booster reports its own peaks: a peak velocity is a claim about what
   * that stage did, while a range is a claim about where that airframe went.
   */
  maxRangeMeters: number;
  /** {@link maxRangeMeters} in the distance unit. */
  maxRange: string;
  /**
   * Whether this stage recorded a ground hit.
   *
   * A normal flight always lands, so this looks like a case that cannot arise.
   * It can: a run that hits the simulation time limit ends without a
   * `GROUND_HIT`, and an aborted one (no motor fired) produces no events at
   * all. The three landing values below are gated behind this rather than
   * falling back to the last sample, so a flight that was still climbing when
   * the run ended does not report a touchdown at the altitude it was flying at.
   */
  hasLanding: boolean;
  /** Horizontal distance from the pad to the landing, in the distance unit. */
  landingDistance: string;
  /** Compass bearing from the pad to the landing, in whole degrees. */
  landingBearing: string;
  /** Seconds after liftoff that this stage came down. */
  landingTime: string;
  /**
   * Where it came down, to six decimals.
   *
   * A distance and a bearing from the pad read the map; they do not walk you to
   * the rocket. This is the pair you type into a handheld, so it is the fact the
   * landing lines lead with.
   */
  landingLatitudeStr: string;
  landingLongitudeStr: string;
  /** This stage's landing as "223.6 m at 27°", like {@link FlightPathWaypoint.rangeText}. */
  landingText: string;
  /** "Sustainer landing" in the export language, with the stage name in the
   *  position that language puts it. */
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
  /** The launch coordinates fixed to six decimals, for a human-facing line. */
  launchLatitudeStr: string;
  launchLongitudeStr: string;
  /** {@link launchAltitudeMeters} in the altitude unit. */
  launchAltitude: string;
  altitudeUnit: string;
  distanceUnit: string;
  /**
   * Unit labels for the peak velocity and acceleration. Neither has a unit
   * option of its own (both are exported in SI whatever the distance unit is),
   * so these name the unit for a template that prints them.
   */
  velocityUnit: string;
  accelerationUnit: string;
  includeFlightPath: boolean;
  includeGroundTrack: boolean;
  /** The KML `<altitudeMode>` a path point's `altitudeKmlMeters` is expressed in. */
  kmlAltitudeMode: string;
  /** The KML `<altitudeMode>` a waypoint's `altitudeKmlMeters` is expressed in. */
  kmlWaypointAltitudeMode: string;
  /**
   * Draw `<extrude>` lines from the track and the pins down to the ground.
   * A Mustache section, not a value: a template that predates this field
   * renders nothing for it, where `<extrude>{{extrude}}</extrude>` would emit an
   * empty element. Already false when the thing is clamped to the ground.
   */
  extrudePath: boolean;
  extrudeWaypoints: boolean;
  /**
   * Break the flight-path line into terrain-following pieces. KML only honors
   * `<tessellate>` for a clamped line, and without it a clamped path cuts
   * straight through hills instead of draping over them.
   */
  tessellatePath: boolean;
  /** Whether waypoint names are drawn on the map. */
  showWaypointLabels: boolean;
  /** Whether waypoint pins carry their stage's color. */
  colorWaypointPins: boolean;
  maxAltitude: string;
  maxVelocity: string;
  maxAcceleration: string;
  /**
   * The farthest any stage got from the pad, horizontally, in the distance
   * unit. Not the landing distance: a rocket can drift downrange under the
   * chute and then partway back, so the range-safety figure is the maximum and
   * where it came down is a separate fact. Both are exported.
   */
  maxRange: string;
  /** Seconds from liftoff to the highest point, to one decimal. */
  timeToApogee: string;
  /** Seconds from liftoff to the end of the flight, to one decimal. */
  flightTime: string;
  /**
   * Whether the summary balloons are written at all. A Mustache section, so a
   * template that does not reference it is unaffected.
   */
  includeDescriptions: boolean;
  /**
   * The built-in templates' own strings, in the export language:
   * `{{labels.maxAltitude}}`. See `LABEL_KEYS` for what is in here and what is
   * deliberately not.
   */
  labels: Record<string, string>;
  branches: FlightPathBranch[];
}

/** Metadata the flight data itself does not carry. */
export interface FlightPathMeta {
  simName: string;
  rocketName: string;
  motorName: string;
}
