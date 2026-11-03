// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** The single-point waypoints that can be emitted for each flight branch. */
export type WaypointKind =
  'pad' | 'liftoff' | 'burnout' | 'apogee' | 'recovery' | 'landing' | 'maxvelocity' | 'maxacceleration';

/** Waypoint kinds in display/emit order (matches the reference enum). */
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

/** Distance units offered for the human-facing altitude/distance columns. */
export type DistanceUnit = 'm' | 'ft' | 'km' | 'mi';

/**
 * A translator, in the shape `i18next` already hands out.
 *
 * The export takes one of these rather than a per-waypoint label callback,
 * because the file's language is a property of the file: the caller binds this
 * to the export language and every string in the output follows, from the
 * waypoint names to the balloon labels. A caller that wants the app's language
 * passes the app's `t`.
 */
export type Translate = (key: string, vars?: Record<string, unknown>) => string;

/**
 * The i18n key for each waypoint kind.
 *
 * Lives here rather than in the dialog because the export's vocabulary is the
 * export's business: the dialog reads it for its checkboxes, and the builder
 * reads it for the names it writes into the file, and a rename has one place
 * to happen.
 */
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

/**
 * What exported altitudes are measured from, the choice OpenRocket's flight
 * path export offers.
 *
 * It matters because the launch altitude defaults to zero: a site actually
 * 1200 m up then reports its flight in meters above the pad, and placing that
 * against sea level buries the whole track under the terrain.
 *
 * `clamped` is ours, not the desktop's: it drapes the track and the pins flat on
 * the terrain, which is what you want when the question is what the rocket drifts
 * over rather than how high it went. The value still travels fine in a desktop
 * template, because the model carries the resolved `<altitudeMode>` as a string.
 */
export type AltitudeReference = 'automatic' | 'ground' | 'sealevel' | 'clamped';

/**
 * Where a stage's own track begins, the choice OpenRocket's flight path export
 * offers.
 *
 * A branch created at stage separation starts life as a verbatim copy of its
 * parent's points, so every non-primary branch repeats the ascent the stages
 * flew bolted together.
 */
export type StageTrackStart = 'separation' | 'pad';

/**
 * `automatic` resolved against a launch altitude: a nonzero launch altitude
 * means the flight can be placed at its true elevation; the default of zero
 * means it cannot.
 */
export function resolveAltitudeReference(
  reference: AltitudeReference,
  launchAltitudeMeters: number,
): Exclude<AltitudeReference, 'automatic'> {
  if (reference !== 'automatic') return reference;
  return launchAltitudeMeters !== 0 && Number.isFinite(launchAltitudeMeters) ? 'sealevel' : 'ground';
}

export interface FlightPathExportOptions {
  /** Which waypoints to emit. */
  waypoints: Set<WaypointKind>;
  /** Emit the full 3D flight-path line. */
  includeFlightPath: boolean;
  /** Emit the ground track (path clamped to the ground). */
  includeGroundTrack: boolean;
  /** Keep every Nth sampled path point (1 = keep all). */
  pathStride: number;
  /** Unit for the human-facing altitude columns/labels. */
  altitudeUnit: DistanceUnit;
  /** Unit for the human-facing horizontal-distance column. */
  distanceUnit: DistanceUnit;
  /**
   * What the exported track's altitudes are measured from. This and
   * `waypointAltitudeReference` are separate settings because a flight is worth
   * seeing suspended in the air, while the pins that label it are easier to read
   * against the ground they sit over.
   */
  altitudeReference: AltitudeReference;
  /** What the exported waypoints' altitudes are measured from. */
  waypointAltitudeReference: AltitudeReference;
  /**
   * Draw a line from the track and each pin straight down to the ground (KML's
   * `<extrude>`, which Google Earth renders as a curtain under the path and a
   * plumb line under a pin). It is how you read where a point in the air sits on
   * the map. Meaningless once the thing is already on the ground, so it is
   * ignored for a clamped reference.
   */
  drawShadow: boolean;
  /** Where each stage's track begins; see {@link StageTrackStart}. */
  stageTrackStart: StageTrackStart;
  /**
   * Whether waypoint names are drawn on the map. A near-vertical flight stacks
   * its waypoints into a few hundred meters of screen, and the reader may
   * prefer bare markers they can click.
   */
  showWaypointLabels: boolean;
  /**
   * Whether waypoint pins carry their stage's color. That needs an icon
   * fetched from Google's servers, so it can be turned off for a file that has
   * to render without a network.
   */
  colorWaypointPins: boolean;
  /**
   * Whether the KML carries the summary balloons: the flight's numbers on the
   * document, the stage's on its folder, and each waypoint's on its own pin.
   * On by default; off for a file going somewhere the descriptions would only
   * get in the way.
   */
  includeDescriptions: boolean;
  /**
   * The language the file is written in, or '' to follow the app.
   *
   * Same argument as the two unit fields: a KML going to someone else
   * may want their language whatever the app happens to be showing, and the
   * choice belongs to the file. Empty is a real, selectable value rather than
   * an absence, so it is stored like any other.
   */
  language: string;
  /**
   * A name for this flight, folded into the document name and into every folder
   * and track name. Several exports opened in one Google Earth session are
   * otherwise indistinguishable: every two-stage design contributes a folder
   * called "Sustainer" and a track called "Sustainer flight path", and two
   * designs can each own a "Simulation 1". Empty means no prefix anywhere.
   */
  missionName: string;
  /**
   * Whether the mission name also prefixes the waypoint markers. Off by
   * default: a near-vertical flight packs every marker into a few screen
   * pixels, where the labels already overlap enough to have a switch of their
   * own, and making each one longer makes that worse. It is useful only when
   * two flights' markers sit on top of each other.
   */
  labelWaypointsWithMission: boolean;
  /**
   * Per-stage flight-path color overrides, keyed by the branch's index in the
   * built model. Sparse on purpose: a stage left on its palette color stores
   * nothing, so the palette can change later without stranding saved values.
   */
  branchColors: Map<number, number>;
  /**
   * Per-stage ground-track color overrides. Same shape, same sparseness.
   *
   * Its own color with its own palette, rather than a darkened derivative of the
   * path color: a derived color washes out against satellite imagery and leaves
   * the user nothing to fix it with. The cost is that from directly overhead,
   * where the ground track sits under the flight path, the two do not read as
   * one line.
   */
  branchGroundColors: Map<number, number>;
  /**
   * Per-stage waypoint-pin color overrides. Same shape again. Without an
   * override a pin takes {@link defaultPinColor}.
   */
  branchPinColors: Map<number, number>;
}

/**
 * Narrow a stored string to a union member, or undefined.
 *
 * The settings store keeps these as plain strings because it must survive a
 * value written by another build; the legal set lives here, next to the union,
 * so there is one place to update when a member is added.
 */
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

/**
 * Default options: every waypoint, both tracks, keep all points. The two
 * distance units start from the user's `distance` preference, so someone who
 * works in feet does not have to re-pick feet on every export, but they stay
 * separate fields, because the file's unit is a property of the file and a
 * KML meant for someone else may want meters whatever the app is showing.
 * A preference other than m, ft, km or mi falls back to meters.
 */
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
    // Not persisted, and deliberately: a mission name left over from the last
    // export silently mislabels this one, which is worse than retyping it.
    missionName: '',
    labelWaypointsWithMission: false,
    branchColors: new Map(),
    branchGroundColors: new Map(),
    branchPinColors: new Map(),
  };
}
