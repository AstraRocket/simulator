import type { FlightResult, FlightEvent, FlightSeries } from '../../../engine/openRocketEngine';
import type { LaunchConditions } from '../../design/orkTree';
import { componentName, isDefaultComponentName } from '../../app/warningText';
import { siToUi, degToRad } from '../../../prefs/units';
import { stageLabel, withUnit } from '../../../i18n/format';
import { offsetToLatLon } from '../../map/geodesy';
import { flightBranches } from '../../flight/flightColumns';
import { eventTime } from '../../flight/flightEvents';
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
import { KERNEL_LAUNCH_SITE } from '../../../tree/kernelDefaults';
import { finiteOr, isFiniteNumber } from '../../app/numbers';

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

function fixed(v: number | null | undefined, digits: number): string {
  return isFiniteNumber(v) ? v.toFixed(digits) : '-';
}

// Empty, not a dash: balloons use these as Mustache sections, where '' hides the line.
function seconds(v: number | null | undefined): string {
  return isFiniteNumber(v) ? v.toFixed(1) : '';
}

const KML_ALTITUDE_MODE: Record<Exclude<AltitudeReference, 'automatic'>, string> = {
  ground: 'relativeToGround',
  sealevel: 'absolute',
  clamped: 'clampToGround',
};

const UNIT_SYMBOL: Record<DistanceUnit, string> = { m: 'm', ft: 'ft', km: 'km', mi: 'mi' };
const UNIT_DECIMALS: Record<DistanceUnit, number> = { m: 1, ft: 1, km: 3, mi: 3 };

function fmtBearing(deg: number, unit: string): string {
  const v = siToUi('angle', unit, degToRad(deg));
  return withUnit(v.toFixed(unit === '°' ? 0 : 2), unit);
}

function fmtLength(meters: number, unit: DistanceUnit): string {
  if (!Number.isFinite(meters)) return '';
  return siToUi('distance', unit, meters).toFixed(UNIT_DECIMALS[unit]);
}

export const EXPORT_FALLBACK_LATITUDE = KERNEL_LAUNCH_SITE.latitudeDeg;
export const EXPORT_FALLBACK_LONGITUDE = KERNEL_LAUNCH_SITE.longitudeDeg;

// Both zero, not either (unlike OpenRocket): a zero latitude or longitude alone is a real site.
function launchPositionUnset(launch: LaunchConditions): boolean {
  return (launch.latitudeDeg ?? 0) === 0 && (launch.longitudeDeg ?? 0) === 0;
}

const series = (s: FlightSeries, key: string): (number | null)[] | undefined => s[key];

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

// The only branch filter, so the color picker and the builder agree on branch indexes.
function usableSeries(s: FlightSeries): { time: (number | null)[]; alt: (number | null)[] } | null {
  const time = series(s, 'time');
  const alt = series(s, 'altitude');
  if (!time || !alt || time.length === 0) return null;
  return { time, alt };
}

export function exportBranchNames(result: FlightResult, meta: FlightPathMeta, t: Translate): string[] {
  return rawBranchesOf(result, meta, t)
    .filter((b) => usableSeries(b.series) !== null)
    .map((b) => b.name);
}

// `angleUnit` affects bearing text only; numeric `bearing` fields stay compass degrees.
export function buildFlightPathModel(
  result: FlightResult,
  launch: LaunchConditions,
  meta: FlightPathMeta,
  options: FlightPathExportOptions,
  t: Translate,
  angleUnit = '°',
): FlightPathModel {
  const unset = launchPositionUnset(launch);
  const lat0 = unset ? EXPORT_FALLBACK_LATITUDE : (launch.latitudeDeg ?? 0);
  const lon0 = unset ? EXPORT_FALLBACK_LONGITUDE : (launch.longitudeDeg ?? 0);
  const launchAlt = launch.launchAltitudeM ?? 0;

  const project = (east: number, north: number) => offsetToLatLon(lat0, lon0, { east, north });

  const altitudeReference = resolveAltitudeReference(options.altitudeReference, launchAlt);
  const waypointReference = resolveAltitudeReference(options.waypointAltitudeReference, launchAlt);
  // KML ignores a clamped altitude; AGL rather than 0 keeps it meaningful to other readers.
  const kmlAltitudeFor =
    (reference: Exclude<AltitudeReference, 'automatic'>) =>
    (altAgl: number): number =>
      reference === 'sealevel' ? altAgl + launchAlt : altAgl;
  const kmlAltitude = kmlAltitudeFor(altitudeReference);
  const kmlWaypointAltitude = kmlAltitudeFor(waypointReference);

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
    velocityUnit: 'm/s',
    accelerationUnit: 'm/s²',
    includeFlightPath: options.includeFlightPath,
    includeGroundTrack: options.includeGroundTrack,
    kmlAltitudeMode: KML_ALTITUDE_MODE[altitudeReference],
    kmlWaypointAltitudeMode: KML_ALTITUDE_MODE[waypointReference],
    extrudePath: options.drawShadow && altitudeReference !== 'clamped',
    extrudeWaypoints: options.drawShadow && waypointReference !== 'clamped',
    tessellatePath: altitudeReference === 'clamped',
    showWaypointLabels: options.showWaypointLabels,
    colorWaypointPins: options.colorWaypointPins,
    maxAltitude: fmtLength(result.summary.maxAltitude, options.altitudeUnit),
    // A JSON-stored result has `null` for NaN/Infinity.
    maxVelocity: fixed(result.summary.maxVelocity, 1),
    maxAcceleration: fixed(result.summary.maxAcceleration, 1),
    maxRange: '',
    timeToApogee: seconds(result.summary.timeToApogee),
    flightTime: seconds(result.summary.flightTime),
    includeDescriptions: options.includeDescriptions,
    labels: buildLabels(t),
    branches: [],
  };

  const rawBranches = rawBranchesOf(result, meta, t);

  const qualify = rawBranches.length > 1;

  for (const [i, raw] of rawBranches.entries()) {
    const branch = buildBranch(raw, options, t, {
      project,
      // The kernel flew an unset site from (0, 0), not the substitute site.
      kernelPosition: !unset,
      launchAlt,
      altUnit: options.altitudeUnit,
      distUnit: options.distanceUnit,
      angleUnit,
      kmlAltitude,
      kmlWaypointAltitude,
      qualify,
      waypointMission: options.labelWaypointsWithMission ? mission : '',
      primary: i === 0,
      stageTrackStart: options.stageTrackStart,
    });
    if (!branch) continue;
    // Not the loop counter: skipped branches would leave gaps, and gaps collide KML style ids.
    branch.index = model.branches.length;
    const rgb = options.branchColors?.get(branch.index) ?? defaultBranchColor(branch.index);
    const groundRgb = options.branchGroundColors?.get(branch.index) ?? defaultGroundColor(branch.index);
    const pinRgb = options.branchPinColors?.get(branch.index) ?? defaultPinColor(branch.index);
    // Prefixed only after waypoints were qualified from the raw stage name.
    branch.name = withMission(mission, branch.name);
    branch.colorRgb = rgbHex(rgb);
    branch.groundColorRgb = rgbHex(groundRgb);
    branch.pinColorRgb = rgbHex(pinRgb);
    branch.pathColorKml = kmlColor(rgb, 0xff);
    branch.groundColorKml = kmlColor(groundRgb, 0xff);
    branch.pinColorKml = kmlColor(pinRgb, 0xff);
    branch.csvPinColor = model.colorWaypointPins ? `#${rgbHex(pinRgb)}` : 'yellow';
    branch.waypointStyled = model.colorWaypointPins || !model.showWaypointLabels;
    model.branches.push(branch);
  }

  let maxRangeMeters = 0;
  for (const branch of model.branches) {
    if (branch.maxRangeMeters > maxRangeMeters) maxRangeMeters = branch.maxRangeMeters;
  }
  model.maxRange = fmtLength(maxRangeMeters, options.distanceUnit);
  return model;
}

interface BranchCtx {
  project: (east: number, north: number) => { lat: number; lon: number };
  kernelPosition: boolean;
  launchAlt: number;
  altUnit: DistanceUnit;
  distUnit: DistanceUnit;
  angleUnit: string;
  kmlAltitude: (altAgl: number) => number;
  kmlWaypointAltitude: (altAgl: number) => number;
  qualify: boolean;
  waypointMission: string;
  primary: boolean;
  stageTrackStart: StageTrackStart;
}

// A separated branch repeats its parent's ascent up to separation, so it starts there.
function branchStartIndex(
  events: FlightEvent[],
  time: (number | null)[],
  n: number,
  ctx: Pick<BranchCtx, 'primary' | 'stageTrackStart'>,
): number {
  if (ctx.primary || ctx.stageTrackStart === 'pad') return 0;
  const separated = eventTime(events, 'STAGE_SEPARATION');
  if (separated == null || !Number.isFinite(separated)) return 0;
  const idx = indexOfTime(time, separated, n);
  return idx > 0 && idx < n ? idx : 0;
}

interface BranchSamples {
  name: string;
  events: FlightEvent[];
  time: (number | null)[];
  alt: (number | null)[];
  east: (number | null)[] | undefined;
  north: (number | null)[] | undefined;
  vel: (number | null)[] | undefined;
  acc: (number | null)[] | undefined;
  n: number;
  start: number;
  positionAt: (i: number) => { lat: number; lon: number };
  distanceAt: (i: number) => number;
  bearingAt: (i: number) => number;
  distanceBearing: (i: number) => string;
  waypointAt: (i: number, type: WaypointKind, label: string, device: string | null) => FlightPathWaypoint;
}

function branchSamples(
  raw: { name: string; events: FlightEvent[]; series: FlightSeries },
  t: Translate,
  ctx: BranchCtx,
): BranchSamples | null {
  const usable = usableSeries(raw.series);
  if (!usable) return null;
  const { time, alt } = usable;

  const east = series(raw.series, 'Px'); // drift east (m)
  const north = series(raw.series, 'Py'); // drift north (m)
  const n = Math.min(time.length, alt.length);

  const eastAt = (i: number) => finiteOr(east?.[i], 0);
  const northAt = (i: number) => finiteOr(north?.[i], 0);
  const phi = ctx.kernelPosition ? series(raw.series, 'φ') : undefined;
  const lam = ctx.kernelPosition ? series(raw.series, 'λ') : undefined;
  const positionAt = (i: number): { lat: number; lon: number } => {
    const la = phi?.[i];
    const lo = lam?.[i];
    if (isFiniteNumber(la) && isFiniteNumber(lo)) {
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
    const altAgl = finiteOr(alt[i], 0);
    const { lat: latitude, lon: longitude } = positionAt(i);
    const mslMeters = altAgl + ctx.launchAlt;
    const t = finiteOr(time[i], 0);
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

function branchRangeMeters(s: BranchSamples): number {
  // From 0, not `start`.
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

function branchLanding(s: BranchSamples, ctx: BranchCtx): BranchLanding {
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

function eventWaypoints(
  s: BranchSamples,
  options: FlightPathExportOptions,
  t: Translate,
  ctx: BranchCtx,
): FlightPathWaypoint[] {
  const waypoints: FlightPathWaypoint[] = [];
  if (ctx.primary && options.waypoints.has('pad')) {
    waypoints.push(s.waypointAt(0, 'pad', t(WAYPOINT_LABEL_KEY.pad), null));
  }

  for (const event of s.events) {
    const kind = EVENT_TO_WAYPOINT[event.type];
    if (!kind || !options.waypoints.has(kind)) continue;
    const i = indexOfTime(s.time, event.time, s.n);
    if (kind === 'recovery') {
      // The TeaVM kernel has no resource bundles: an unrenamed device arrives as `[Parachute.Parachute]`.
      const raw = event.source ?? '';
      const device = componentName(raw, t);
      const named = raw !== '' && !isDefaultComponentName(raw);
      const label = qualifyLabel(device, t(WAYPOINT_LABEL_KEY.recovery), named);
      waypoints.push(s.waypointAt(i, 'recovery', label, device));
    } else {
      waypoints.push(s.waypointAt(i, kind, t(WAYPOINT_LABEL_KEY[kind]), null));
    }
  }
  return waypoints;
}

function peakWaypoints(s: BranchSamples, options: FlightPathExportOptions, t: Translate): FlightPathWaypoint[] {
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

function trackPoints(s: BranchSamples, options: FlightPathExportOptions, ctx: BranchCtx): FlightPathPoint[] {
  if (!options.includeFlightPath && !options.includeGroundTrack) return [];
  const { time, alt, east, north, n, start } = s;
  const stride = Math.max(1, options.pathStride);
  const path: FlightPathPoint[] = [];
  // Skip a missing sample: a 0 fallback would plant a mid-flight point on the pad.
  const pushPoint = (i: number) => {
    if (![time[i], alt[i], north?.[i], east?.[i]].every(isFiniteNumber)) return;
    const altAgl = finiteOr(alt[i], 0);
    const t = finiteOr(time[i], 0);
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
  // Measured from `start`, not 0, or a separated branch can drop its last point.
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
  // Stable sort: a peak on an event's sample stays after that event.
  const waypoints = [...eventWaypoints(s, options, t, ctx), ...peakWaypoints(s, options, t)].sort(
    (a, b) => a.time - b.time,
  );
  const path = trackPoints(s, options, ctx);

  return {
    name: raw.name,
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
    const diff = Math.abs(finiteOr(time[i], 0) - t);
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

function withMission(mission: string, text: string | null | undefined): string {
  if (!mission || !text) return text ?? '';
  return text.toLowerCase().startsWith(mission.toLowerCase()) ? text : `${mission} ${text}`;
}

function qualifyLabel(qualifier: string, label: string, qualify: boolean): string {
  if (!qualify || !qualifier || !label) return label ?? '';
  return label.toLowerCase().startsWith(qualifier.toLowerCase()) ? label : `${qualifier} ${label}`;
}

export function hasLaunchPosition(launch: LaunchConditions): boolean {
  return !launchPositionUnset(launch);
}
