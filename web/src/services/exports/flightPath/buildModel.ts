import type { FlightResult, FlightEvent, FlightSeries } from '../../../engine/openRocketEngine';
import type { LaunchConditions } from '../../design/orkTree';
import { componentName, isDefaultComponentName } from '../../app/warningText';
import { siToUi, degToRad } from '../../../prefs/units';
import { stageLabel, withUnit } from '../../../i18n/format';
import { offsetToLatLon } from '../../map/geodesy';
import { flightBranches } from '../../flight/flightColumns';
import { bearingFromPad, distanceFromPad } from '../../flight/groundTrack';
import {
  resolveAltitudeReference,
  WAYPOINT_LABEL_KEY,
  type AltitudeReference,
  type DistanceUnit,
  type FlightPathExportOptions,
  type StageTrackStart,
  type Translate,
  type WaypointKind,
} from './options';
import { defaultBranchColor, defaultGroundColor, defaultPinColor, kmlColor, rgbHex } from './colors';
import type { FlightPathBranch, FlightPathMeta, FlightPathModel, FlightPathPoint, FlightPathWaypoint } from './model';

// ---------------------------------------------------------------------------
// Labels and number formatting
// ---------------------------------------------------------------------------

/**
 * The strings the built-in templates write into the file, by the name a
 * template refers to them by: `{{labels.maxAltitude}}`.
 *
 * They are on the model rather than inline in the template so that the export
 * language can differ from the app's. A phrase whose word order changes between
 * languages is not in here - it is composed through `t()` with its values and
 * arrives as one finished string (see `distanceBearing` and `stageLanding`),
 * because a template that glues translated fragments together in English order
 * produces English word order in every language.
 */
const LABEL_KEYS = [
  'rocket',
  'time',
  'configuration',
  'launchSite',
  'latLon',
  'aboveSeaLevel',
  'abovePad',
  'fromThePad',
  'maxAltitude',
  'maxVelocity',
  'maxAcceleration',
  'maxRange',
  'timeToApogee',
  'flightTime',
  'altitude',
  'position',
  'coordinates',
  'landing',
  'device',
  'flightPath',
  'groundTrack',
] as const;

function buildLabels(t: Translate): Record<string, string> {
  return Object.fromEntries(LABEL_KEYS.map((k) => [k, t(`pathExport.doc.${k}`)]));
}

/** `toFixed`, but a non-finite or absent value reads as a dash, not a throw. */
function fixed(v: number | null | undefined, digits: number): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '-';
}

/**
 * A time in seconds to one decimal, or empty for a moment the flight never
 * reached. Empty rather than a dash because the balloons use these as Mustache
 * sections, and an empty string is false there: the line disappears instead of
 * reporting a flight time the run does not have.
 */
function seconds(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(1) : '';
}

/** The KML `<altitudeMode>` a resolved reference is expressed in. */
const KML_ALTITUDE_MODE: Record<Exclude<AltitudeReference, 'automatic'>, string> = {
  ground: 'relativeToGround',
  sealevel: 'absolute',
  clamped: 'clampToGround',
};

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

const UNIT_SYMBOL: Record<DistanceUnit, string> = { m: 'm', ft: 'ft', km: 'km', mi: 'mi' };
/** Decimals shown per unit (larger units get more). */
const UNIT_DECIMALS: Record<DistanceUnit, number> = { m: 1, ft: 1, km: 3, mi: 3 };

/**
 * A compass bearing in degrees, in `unit` with its symbol: whole degrees, or
 * two more places in radians, the precision `fmtDegrees` gives the app.
 */
function fmtBearing(deg: number, unit: string): string {
  const v = siToUi('angle', unit, degToRad(deg));
  return withUnit(v.toFixed(unit === '°' ? 0 : 2), unit);
}

/** Render a meters value in the given unit, without the unit symbol. */
function fmtLength(meters: number, unit: DistanceUnit): string {
  if (!Number.isFinite(meters)) return '';
  return siToUi('distance', unit, meters).toFixed(UNIT_DECIMALS[unit]);
}

// ---------------------------------------------------------------------------
// Geographic projection
// ---------------------------------------------------------------------------

/**
 * Coordinates written into the exported file when the design carries no launch
 * position: the Kennedy Space Center, the launch site the kernel defaults to
 * (`OpenRocketEngine.simulateJson`). Dropping a flight on Null Island tells the
 * reader nothing.
 *
 * These are used for the exported coordinates only. Nothing here writes to the
 * design, and its launch position is left exactly as the user set it.
 */
export const EXPORT_FALLBACK_LATITUDE = 28.61;
export const EXPORT_FALLBACK_LONGITUDE = -80.6;

/**
 * True when both coordinates are still zero, the only combination that cannot
 * be a real launch site anyone uses, since (0, 0) is open ocean in the Gulf of
 * Guinea.
 *
 * Both, not either: a zero longitude is a
 * legitimate position (Greenwich, and everywhere else on the prime meridian),
 * and so is a zero latitude, so OpenRocket's rule would
 * relocate a real launch site that happens to sit on one of those lines.
 */
function launchPositionUnset(launch: LaunchConditions): boolean {
  return (launch.latitudeDeg ?? 0) === 0 && (launch.longitudeDeg ?? 0) === 0;
}

// ---------------------------------------------------------------------------
// Model builder
// ---------------------------------------------------------------------------

/** Coerce a possibly-missing series value to a finite number, or 0. */
const finiteOr0 = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const series = (s: FlightSeries, key: string): (number | null)[] | undefined => s[key];

/**
 * Staged flights carry per-branch data (branch 0 = the sustainer stack); a
 * single flight is exported as one synthetic branch from the top-level series,
 * named after the rocket, the simulation or, failing both, the translated
 * "Flight". A branch is named as every other view names a stage, so an unnamed
 * stage reads "Stage n" in folders, tracks and qualified waypoints.
 */
function rawBranchesOf(
  result: FlightResult,
  meta: FlightPathMeta,
  t: Translate,
): { name: string; events: FlightEvent[]; series: FlightSeries }[] {
  return flightBranches(result, meta.rocketName || meta.simName || t('pathExport.doc.flight')).map((b, i) => ({
    ...b,
    name: stageLabel(t, i, b.name),
  }));
}

/**
 * The two series every branch is built from, or null when the branch produced
 * nothing usable. The one place that decides whether a branch exports at all,
 * so the color picker and the builder cannot disagree about how many there are.
 */
function usableSeries(s: FlightSeries): { time: (number | null)[]; alt: (number | null)[] } | null {
  const time = series(s, 'time');
  const alt = series(s, 'altitude');
  if (!time || !alt || time.length === 0) return null;
  return { time, alt };
}

/**
 * The raw stage names of the branches this flight will actually export, in the
 * order their `index` will be assigned: what the stage-color picker offers a
 * swatch for. Unprefixed: it names the stage, not the file.
 */
export function exportBranchNames(result: FlightResult, meta: FlightPathMeta, t: Translate): string[] {
  return rawBranchesOf(result, meta, t)
    .filter((b) => usableSeries(b.series) !== null)
    .map((b) => b.name);
}

/**
 * Build the flight-path model from a simulation result and its launch site.
 *
 * @param t resolves the export's strings. Bind it to `options.language` and
 *          every string in the file follows; the app's own `t` writes the file
 *          in whatever the app is showing.
 * @param angleUnit the reader's angle unit symbol (`°` or `rad`), which the
 *          bearing in a distance-and-bearing line is written in. The numeric
 *          `bearing` fields stay compass degrees for templates.
 */
export function buildFlightPathModel(
  result: FlightResult,
  launch: LaunchConditions,
  meta: FlightPathMeta,
  options: FlightPathExportOptions,
  t: Translate,
  angleUnit = '°',
): FlightPathModel {
  // A position left at (0, 0) was never filled in, and is exported from the
  // Kennedy Space Center rather than from Null Island. The design is untouched.
  const unset = launchPositionUnset(launch);
  const lat0 = unset ? EXPORT_FALLBACK_LATITUDE : (launch.latitudeDeg ?? 0);
  const lon0 = unset ? EXPORT_FALLBACK_LONGITUDE : (launch.longitudeDeg ?? 0);
  const launchAlt = launch.launchAltitudeM ?? 0;

  const project = (east: number, north: number) => offsetToLatLon(lat0, lon0, { east, north });

  // `automatic` only means something once there is a launch altitude to judge,
  // so it is resolved here and the model carries the answer, not the question.
  const altitudeReference = resolveAltitudeReference(options.altitudeReference, launchAlt);
  const waypointReference = resolveAltitudeReference(options.waypointAltitudeReference, launchAlt);
  // A clamped coordinate's altitude is ignored by KML, but writing the AGL value
  // rather than a bare 0 keeps the number meaningful to anything else reading it.
  const kmlAltitudeFor =
    (reference: Exclude<AltitudeReference, 'automatic'>) =>
    (altAgl: number): number =>
      reference === 'sealevel' ? altAgl + launchAlt : altAgl;
  const kmlAltitude = kmlAltitudeFor(altitudeReference);
  const kmlWaypointAltitude = kmlAltitudeFor(waypointReference);

  // Trimmed once here, so a name that is nothing but spaces is no mission at
  // all rather than a leading space on every name in the file.
  const mission = (options.missionName ?? '').trim();

  const model: FlightPathModel = {
    title: withMission(mission, meta.simName),
    rocketName: meta.rocketName,
    simulationName: meta.simName,
    motor: meta.motorName,
    configuration: meta.motorName,
    launchLatitude: lat0,
    launchLongitude: lon0,
    launchAltitudeMeters: launchAlt,
    launchLatitudeStr: lat0.toFixed(6),
    launchLongitudeStr: lon0.toFixed(6),
    launchAltitude: fmtLength(launchAlt, options.altitudeUnit),
    altitudeUnit: UNIT_SYMBOL[options.altitudeUnit],
    distanceUnit: UNIT_SYMBOL[options.distanceUnit],
    // The two peaks are SI whatever the distance unit is, so these are
    // constants rather than a lookup; see the field docs.
    velocityUnit: 'm/s',
    accelerationUnit: 'm/s²',
    includeFlightPath: options.includeFlightPath,
    includeGroundTrack: options.includeGroundTrack,
    kmlAltitudeMode: KML_ALTITUDE_MODE[altitudeReference],
    kmlWaypointAltitudeMode: KML_ALTITUDE_MODE[waypointReference],
    // Nothing to extrude to once a thing is already lying on the ground.
    extrudePath: options.drawShadow && altitudeReference !== 'clamped',
    extrudeWaypoints: options.drawShadow && waypointReference !== 'clamped',
    tessellatePath: altitudeReference === 'clamped',
    showWaypointLabels: options.showWaypointLabels,
    colorWaypointPins: options.colorWaypointPins,
    maxAltitude: fmtLength(result.summary.maxAltitude, options.altitudeUnit),
    // `toFixed` on a non-number throws. A stored result that went through
    // JSON has `null` wherever a NaN/Infinity was. `readResults` rejects such
    // a result; `fixed` is the second line of defense, on the path a user
    // reaches by exporting after a reload.
    maxVelocity: fixed(result.summary.maxVelocity, 1),
    maxAcceleration: fixed(result.summary.maxAcceleration, 1),
    // Filled in below, once the branches it is the maximum over exist.
    maxRange: '',
    timeToApogee: seconds(result.summary.timeToApogee),
    flightTime: seconds(result.summary.flightTime),
    includeDescriptions: options.includeDescriptions,
    labels: buildLabels(t),
    branches: [],
  };

  const rawBranches = rawBranchesOf(result, meta, t);

  // Only a staged flight needs its waypoints qualified; see `qualifyLabel`.
  const qualify = rawBranches.length > 1;

  for (const [i, raw] of rawBranches.entries()) {
    const branch = buildBranch(raw, options, t, {
      project,
      // The kernel flew an unset site from (0, 0); its coordinates describe
      // that, not the substitute site the file is written about.
      kernelPosition: !unset,
      launchAlt,
      altUnit: options.altitudeUnit,
      distUnit: options.distanceUnit,
      angleUnit,
      kmlAltitude,
      kmlWaypointAltitude,
      qualify,
      // Empty unless the markers were opted in, so the mission can be folded
      // into the folder and track names without reaching the pins.
      waypointMission: options.labelWaypointsWithMission ? mission : '',
      primary: i === 0,
      stageTrackStart: options.stageTrackStart,
    });
    if (!branch) continue;
    // Assigned on push, not from the loop counter: a branch that yields no
    // usable series is skipped, and the indices must stay contiguous or two
    // branches would share a KML style id.
    branch.index = model.branches.length;
    // Three colors, each one either the user's pick or this stage's own
    // default. Nothing is computed from anything else, so changing one never
    // moves another and a picked color reaches the output byte for byte.
    const rgb = options.branchColors?.get(branch.index) ?? defaultBranchColor(branch.index);
    const groundRgb = options.branchGroundColors?.get(branch.index) ?? defaultGroundColor(branch.index);
    const pinRgb = options.branchPinColors?.get(branch.index) ?? defaultPinColor(branch.index);
    // The folder name carries the mission; the raw stage name stays on the
    // branch context, where the waypoint labels are qualified from it. Prefix
    // the branch name first and qualify from that, and the two cannot be had
    // separately.
    branch.name = withMission(mission, branch.name);
    branch.colorRgb = rgbHex(rgb);
    branch.groundColorRgb = rgbHex(groundRgb);
    branch.pinColorRgb = rgbHex(pinRgb);
    // All three opaque, whatever the color's provenance: an alpha that depends on
    // whether the color was derived renders the same color differently depending
    // on how it got there, so picking exactly the default differs from leaving it
    // alone. Translucency, if wanted, becomes its own control with its own
    // default, by the same rule as the colors.
    branch.pathColorKml = kmlColor(rgb, 0xff);
    branch.groundColorKml = kmlColor(groundRgb, 0xff);
    branch.pinColorKml = kmlColor(pinRgb, 0xff);
    branch.csvPinColor = model.colorWaypointPins ? `#${rgbHex(pinRgb)}` : 'yellow';
    branch.waypointStyled = model.colorWaypointPins || !model.showWaypointLabels;
    model.branches.push(branch);
  }

  // The flight's range is the farthest any one stage reached. A pass over the
  // finished branches rather than a second scan of the series: the per-branch
  // maxima are already the answer, and computing it twice is how the two drift.
  let maxRangeMeters = 0;
  for (const branch of model.branches) {
    if (branch.maxRangeMeters > maxRangeMeters) maxRangeMeters = branch.maxRangeMeters;
  }
  model.maxRange = fmtLength(maxRangeMeters, options.distanceUnit);
  return model;
}

interface BranchCtx {
  /** A drift offset as a position about the export's launch site. */
  project: (east: number, north: number) => { lat: number; lon: number };
  /** Whether the kernel's recorded latitude and longitude describe this export's site. */
  kernelPosition: boolean;
  launchAlt: number;
  altUnit: DistanceUnit;
  distUnit: DistanceUnit;
  /** The angle unit symbol a bearing is written in. */
  angleUnit: string;
  /** Height above the ground → the altitude a KML coordinate should carry. */
  kmlAltitude: (altAgl: number) => number;
  kmlWaypointAltitude: (altAgl: number) => number;
  /** True when the flight staged, so waypoint labels name their stage. */
  qualify: boolean;
  /**
   * The mission prefix for the waypoint labels, or '' for none. Kept apart from
   * the branch name for the reason given where it is applied: the folder and
   * track names can carry the mission while the markers stay short.
   */
  waypointMission: string;
  /**
   * True for the branch the whole vehicle flew. Leaving the pad is something
   * the stack does, not any one stage, so only this branch gets a pad
   * waypoint, and only the others can have a shared ascent to trim.
   */
  primary: boolean;
  /** Where this branch's own flight begins; see {@link StageTrackStart}. */
  stageTrackStart: StageTrackStart;
}

/**
 * The first data index belonging to this branch alone.
 *
 * A separated branch repeats its parent's points from the pad up to the moment
 * it let go. Exporting that prefix again draws the shared ascent once per
 * stage, and attributes the stack's flight (and its peak speed) to a stage
 * that was not yet flying on its own.
 *
 * Falls back to 0 for the primary branch, when the user asked for every track
 * to start on the pad, and for any branch with no recorded separation.
 */
function branchStartIndex(
  events: FlightEvent[],
  time: (number | null)[],
  n: number,
  ctx: Pick<BranchCtx, 'primary' | 'stageTrackStart'>,
): number {
  if (ctx.primary || ctx.stageTrackStart === 'pad') return 0;
  const separation = events.find((e) => e.type === 'STAGE_SEPARATION');
  if (!separation || !Number.isFinite(separation.time)) return 0;
  const idx = indexOfTime(time, separation.time, n);
  return idx > 0 && idx < n ? idx : 0;
}

/**
 * One branch's samples, read once, and the per-sample lookups every phase of
 * {@link buildBranch} shares: where the vehicle was, how far from the pad and
 * in which direction, and the waypoint a sample makes.
 */
interface BranchSamples {
  name: string;
  events: FlightEvent[];
  time: (number | null)[];
  alt: (number | null)[];
  east: (number | null)[] | undefined;
  north: (number | null)[] | undefined;
  vel: (number | null)[] | undefined;
  acc: (number | null)[] | undefined;
  /** How many samples have both a time and an altitude. */
  n: number;
  /** The first sample that belongs to this branch alone; see {@link branchStartIndex}. */
  start: number;
  /** The kernel's position at a sample, or the drift projected when it has none. */
  positionAt: (i: number) => { lat: number; lon: number };
  distanceAt: (i: number) => number;
  bearingAt: (i: number) => number;
  /** "223.6 m at 27°", in the export language and the reader's angle unit. */
  distanceBearing: (i: number) => string;
  waypointAt: (i: number, type: WaypointKind, label: string, device: string | null) => FlightPathWaypoint;
}

/** Read a branch's samples and build its lookups; null when it has no usable time and altitude. */
function branchSamples(
  raw: { name: string; events: FlightEvent[]; series: FlightSeries },
  t: Translate,
  ctx: BranchCtx,
): BranchSamples | null {
  const usable = usableSeries(raw.series);
  if (!usable) return null;
  const { time, alt } = usable;

  const east = series(raw.series, 'Px'); // lateral drift east (m)
  const north = series(raw.series, 'Py'); // lateral drift north (m)
  const n = Math.min(time.length, alt.length);

  const eastAt = (i: number) => finiteOr0(east?.[i]);
  const northAt = (i: number) => finiteOr0(north?.[i]);
  const phi = ctx.kernelPosition ? series(raw.series, 'φ') : undefined;
  const lam = ctx.kernelPosition ? series(raw.series, 'λ') : undefined;
  const positionAt = (i: number): { lat: number; lon: number } => {
    const la = phi?.[i];
    const lo = lam?.[i];
    if (typeof la === 'number' && Number.isFinite(la) && typeof lo === 'number' && Number.isFinite(lo)) {
      return { lat: la, lon: lo };
    }
    return ctx.project(eastAt(i), northAt(i));
  };
  const distanceAt = (i: number) => distanceFromPad({ east: eastAt(i), north: northAt(i) });
  const bearingAt = (i: number) => bearingFromPad({ east: eastAt(i), north: northAt(i) });

  const distanceBearing = (i: number): string =>
    t('pathExport.doc.distanceBearing', {
      distance: fmtLength(distanceAt(i), ctx.distUnit),
      unit: UNIT_SYMBOL[ctx.distUnit],
      bearing: fmtBearing(bearingAt(i), ctx.angleUnit),
    });

  const waypointAt = (i: number, type: WaypointKind, label: string, device: string | null): FlightPathWaypoint => {
    const altAgl = finiteOr0(alt[i]);
    const { lat: latitude, lon: longitude } = positionAt(i);
    const mslMeters = altAgl + ctx.launchAlt;
    const t = finiteOr0(time[i]);
    return {
      type,
      label,
      device: device ?? '',
      latitude,
      longitude,
      latitudeStr: latitude.toFixed(6),
      longitudeStr: longitude.toFixed(6),
      altitudeMslMeters: mslMeters,
      altitudeAglMeters: altAgl,
      altitudeKmlMeters: ctx.kmlWaypointAltitude(altAgl),
      time: t,
      timeStr: t.toFixed(2),
      timeText: seconds(t),
      altitude: fmtLength(altAgl, ctx.altUnit),
      altitudeMsl: fmtLength(mslMeters, ctx.altUnit),
      distance: fmtLength(distanceAt(i), ctx.distUnit),
      bearing: bearingAt(i).toFixed(0),
      rangeText: distanceBearing(i),
      qualifiedLabel: withMission(ctx.waypointMission, qualifyLabel(raw.name, label, ctx.qualify)),
      branchName: raw.name,
    };
  };

  return {
    name: raw.name,
    events: raw.events,
    time,
    alt,
    east,
    north,
    vel: series(raw.series, 'velocity'),
    acc: series(raw.series, 'acceleration'),
    n,
    start: branchStartIndex(raw.events, time, n, ctx),
    positionAt,
    distanceAt,
    bearingAt,
    distanceBearing,
    waypointAt,
  };
}

/** The farthest the branch got from the pad, in meters. */
function branchRangeMeters(s: BranchSamples): number {
  // From 0, not from `start`: see `maxRangeMeters` on FlightPathBranch for why
  // a separated stage owns the whole stack's excursion.
  let max = 0;
  for (let i = 0; i < s.n; i++) max = Math.max(max, s.distanceAt(i));
  return max;
}

type BranchLanding = Pick<
  FlightPathBranch,
  | 'hasLanding'
  | 'landingDistance'
  | 'landingBearing'
  | 'landingTime'
  | 'landingLatitudeStr'
  | 'landingLongitudeStr'
  | 'landingText'
>;

/** Where the branch came down, or the empty summary when it never did. */
function branchLanding(s: BranchSamples, ctx: BranchCtx): BranchLanding {
  // Scanned from the branch's own events, not read back out of its waypoints:
  // the user can switch the landing marker off, and the summary still has to
  // know where the stage came down.
  const groundHit = s.events.find((e) => e.type === 'GROUND_HIT' && Number.isFinite(e.time));
  if (!groundHit) {
    return {
      hasLanding: false,
      landingDistance: '',
      landingBearing: '',
      landingTime: '',
      landingLatitudeStr: '',
      landingLongitudeStr: '',
      landingText: '',
    };
  }
  const i = indexOfTime(s.time, groundHit.time, s.n);
  const landing = s.positionAt(i);
  return {
    hasLanding: true,
    landingDistance: fmtLength(s.distanceAt(i), ctx.distUnit),
    landingBearing: s.bearingAt(i).toFixed(0),
    landingTime: seconds(groundHit.time),
    landingLatitudeStr: landing.lat.toFixed(6),
    landingLongitudeStr: landing.lon.toFixed(6),
    landingText: s.distanceBearing(i),
  };
}

/** The pad and the flight-event waypoints the options ask for, in event order. */
function eventWaypoints(
  s: BranchSamples,
  options: FlightPathExportOptions,
  t: Translate,
  ctx: BranchCtx,
): FlightPathWaypoint[] {
  const waypoints: FlightPathWaypoint[] = [];
  // Only the stack leaves the pad; a booster's copy of that moment is not its
  // own event, and emitting it per stage litters the map with duplicate pins.
  if (ctx.primary && options.waypoints.has('pad')) {
    waypoints.push(s.waypointAt(0, 'pad', t(WAYPOINT_LABEL_KEY.pad), null));
  }

  for (const event of s.events) {
    const kind = EVENT_TO_WAYPOINT[event.type];
    if (!kind || !options.waypoints.has(kind)) continue;
    const i = indexOfTime(s.time, event.time, s.n);
    if (kind === 'recovery') {
      // A device the user never renamed reaches us as the bundle key its
      // default name is looked up under - `[Parachute.Parachute]` - because the
      // TeaVM kernel carries no resource bundles. Translated with the export's
      // translator, so it follows the language box like every other word in
      // the file.
      const raw = event.source ?? '';
      const device = componentName(raw, t);
      // The event word, qualified by the device: "Drogue Ejection", not
      // "Drogue" and not a bare "Ejection". Naming the pin for the device
      // alone loses the event vocabulary that every other pin uses; naming it
      // for the event alone makes a dual-deployment flight two identical pins.
      // Only a name the user chose qualifies - a default one says nothing the
      // balloon's device line does not. Same qualifier helper the stage names
      // use, so it inherits the guard against doubling a name that already
      // starts with the qualifier, and a staged flight stacks the two into
      // "Booster Drogue Ejection", which is long and is exactly what that pin
      // is.
      const named = raw !== '' && !isDefaultComponentName(raw);
      const label = qualifyLabel(device, t(WAYPOINT_LABEL_KEY.recovery), named);
      waypoints.push(s.waypointAt(i, 'recovery', label, device));
    } else {
      waypoints.push(s.waypointAt(i, kind, t(WAYPOINT_LABEL_KEY[kind]), null));
    }
  }
  return waypoints;
}

/** The max-velocity and max-acceleration waypoints the options ask for. */
function peakWaypoints(s: BranchSamples, options: FlightPathExportOptions, t: Translate): FlightPathWaypoint[] {
  // Scanned from the separation point so a spent booster reports its own peaks.
  // Scanning the copied ascent instead labels the whole stack's maxima as the
  // booster's, at speeds it reached while still bolted to the sustainer.
  const peaks: [Extract<WaypointKind, 'maxvelocity' | 'maxacceleration'>, (number | null)[] | undefined][] = [
    ['maxvelocity', s.vel],
    ['maxacceleration', s.acc],
  ];
  const waypoints: FlightPathWaypoint[] = [];
  for (const [kind, values] of peaks) {
    if (!options.waypoints.has(kind) || !values || !values.length) continue;
    const i = indexOfMax(values, s.start, Math.min(s.n, values.length));
    waypoints.push(s.waypointAt(i, kind, t(WAYPOINT_LABEL_KEY[kind]), null));
  }
  return waypoints;
}

/** The branch's track, strided, from its own start to its last sample; empty when no line was asked for. */
function trackPoints(s: BranchSamples, options: FlightPathExportOptions, ctx: BranchCtx): FlightPathPoint[] {
  if (!options.includeFlightPath && !options.includeGroundTrack) return [];
  const { time, alt, east, north, n, start } = s;
  const stride = Math.max(1, options.pathStride);
  const path: FlightPathPoint[] = [];
  /**
   * One track point, or nothing at all for a sample we do not have.
   *
   * `finiteOr0` is the right answer for a summary figure (a missing distance
   * reads as zero range) and the wrong one for a track point, where it plants
   * the rocket on the pad at sea level in the middle of the flight and draws a
   * line down to it and back.
   *
   * Skipped rather than broken into separate track segments: a KML `LineString`
   * and a GPX `trkseg` are one polyline per branch by format, and the templates
   * are a published contract. So the line between the two real neighbors still
   * closes the gap, which is an interpolation between two measured points
   * rather than a fabricated sea-level point.
   */
  const pushPoint = (i: number) => {
    if (![time[i], alt[i], north?.[i], east?.[i]].every((v) => typeof v === 'number' && Number.isFinite(v))) return;
    const altAgl = finiteOr0(alt[i]);
    const t = finiteOr0(time[i]);
    const at = s.positionAt(i);
    path.push({
      latitude: at.lat,
      longitude: at.lon,
      altitudeMslMeters: altAgl + ctx.launchAlt,
      altitudeAglMeters: altAgl,
      altitudeKmlMeters: ctx.kmlAltitude(altAgl),
      time: t,
      timeStr: t.toFixed(2),
      altitude: fmtLength(altAgl, ctx.altUnit),
    });
  };
  for (let i = start; i < n; i += stride) pushPoint(i);
  // Always include the final point so the track ends at landing. Measured
  // from `start`, not from 0, or a strided separated branch drops its last
  // point whenever the trimmed length happens to land on the stride.
  if (n > start && (n - 1 - start) % stride !== 0) pushPoint(n - 1);
  return path;
}

function buildBranch(
  raw: { name: string; events: FlightEvent[]; series: FlightSeries },
  options: FlightPathExportOptions,
  t: Translate,
  ctx: BranchCtx,
): FlightPathBranch | null {
  const s = branchSamples(raw, t, ctx);
  if (!s) return null;

  const maxRangeMeters = branchRangeMeters(s);
  // Events first, then peaks, then one stable sort by time: a peak that falls
  // on an event's sample keeps its place after that event.
  const waypoints = [...eventWaypoints(s, options, t, ctx), ...peakWaypoints(s, options, t)].sort(
    (a, b) => a.time - b.time,
  );
  const path = trackPoints(s, options, ctx);

  return {
    name: raw.name,
    // index / colors are filled in by the caller, which knows the branch's
    // position among the ones that actually produced data.
    index: 0,
    colorRgb: '',
    groundColorRgb: '',
    pinColorRgb: '',
    pathColorKml: '',
    groundColorKml: '',
    pinColorKml: '',
    csvPinColor: 'yellow',
    waypointStyled: true,
    waypoints,
    path,
    hasPath: path.length > 0,
    hasWaypoints: waypoints.length > 0,
    maxRangeMeters,
    maxRange: fmtLength(maxRangeMeters, ctx.distUnit),
    ...branchLanding(s, ctx),
    landingHeading: t('pathExport.doc.stageLanding', { stage: raw.name }),
  };
}

/** OpenRocket flight-event type → waypoint kind. */
const EVENT_TO_WAYPOINT: Record<string, WaypointKind | undefined> = {
  LIFTOFF: 'liftoff',
  BURNOUT: 'burnout',
  APOGEE: 'apogee',
  RECOVERY_DEVICE_DEPLOYMENT: 'recovery',
  GROUND_HIT: 'landing',
};

function indexOfTime(time: (number | null)[], t: number, n: number): number {
  let best = 0;
  let bestDiff = Infinity;
  const limit = Math.min(n, time.length);
  for (let i = 0; i < limit; i++) {
    const diff = Math.abs(finiteOr0(time[i]) - t);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

function indexOfMax(values: (number | null)[], from: number, n: number): number {
  let maxIndex = from;
  let max = -Infinity;
  for (let i = from; i < n; i++) {
    const v = values[i];
    if (v != null && Number.isFinite(v) && v > max) {
      max = v;
      maxIndex = i;
    }
  }
  return maxIndex;
}

/**
 * A name prefixed with the mission, if there is one. The `startsWith` guard
 * keeps a mission named after the rocket from yielding "Sod Blaster Sod
 * Blaster Sustainer", which is the common case, since the obvious thing to type
 * is the name of the thing you flew.
 */
function withMission(mission: string, text: string | null | undefined): string {
  if (!mission || !text) return text ?? '';
  return text.toLowerCase().startsWith(mission.toLowerCase()) ? text : `${mission} ${text}`;
}

/**
 * A waypoint label prefixed with the stage it belongs to, e.g. "Booster
 * Apogee", when `qualify` is set (the caller sets it when the flight staged).
 * Otherwise every stage contributes an identically named "Apogee", "Burnout"
 * and "Landing" and the export is impossible to read. A label that already
 * starts with the stage name is left alone rather than stuttering.
 */
function qualifyLabel(qualifier: string, label: string, qualify: boolean): string {
  if (!qualify || !qualifier || !label) return label ?? '';
  return label.toLowerCase().startsWith(qualifier.toLowerCase()) ? label : `${qualifier} ${label}`;
}

/**
 * True when the design carries a launch position the export can use as-is.
 * False means {@link buildFlightPathModel} substitutes the Kennedy Space
 * Center, which the dialog warns about.
 */
export function hasLaunchPosition(launch: LaunchConditions): boolean {
  return !launchPositionUnset(launch);
}
