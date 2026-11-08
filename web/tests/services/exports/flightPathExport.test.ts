import { describe, it, expect } from 'vitest';
import {
  buildFlightPathModel,
  defaultBranchColor,
  defaultGroundColor,
  defaultPinColor,
  defaultExportOptions,
  exportBranchNames,
  hasLaunchPosition,
  renderUserTemplate,
  mimeForExtension,
  EXPORT_FORMATS,
  hexToRgbInt,
  type WaypointKind,
} from '../../../src/services/exports/flightPathExport';
import { renderKml, renderGpx, renderWaypointCsv } from '../../../src/services/exports/flightPath/formats';
import { resolveAltitudeReference } from '../../../src/services/exports/flightPath/options';
import {
  EXPORT_FALLBACK_LATITUDE,
  EXPORT_FALLBACK_LONGITUDE,
} from '../../../src/services/exports/flightPath/buildModel';
import type { FlightResult } from '../../../src/engine/openRocketEngine';
import type { LaunchConditions } from '../../../src/services/design/orkTree';
import en from '../../../src/i18n/locales/en.json';
import es from '../../../src/i18n/locales/es.json';
import { localeTranslator } from '../../testing/localeTranslator';
import { offsetToLatLon } from '../../../src/services/map/geodesy';

const result = {
  summary: { maxAltitude: 100, maxVelocity: 50, maxAcceleration: 20, timeToApogee: 1, flightTime: 2 },
  series: {
    time: [0, 1, 2],
    altitude: [0, 100, 0],
    velocity: [0, 50, 10],
    acceleration: [20, 5, -9.8],
    Px: [0, 50, 100], // east (m)
    Py: [0, 100, 200], // north (m)
  },
  events: [
    { type: 'LIFTOFF', time: 0.0 },
    { type: 'APOGEE', time: 1.0 },
    { type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 1.0, source: 'Main chute' },
    { type: 'GROUND_HIT', time: 2.0 },
  ],
} as unknown as FlightResult;

const launch: LaunchConditions = {
  latitudeDeg: 40,
  longitudeDeg: -105,
  launchAltitudeM: 1600,
} as LaunchConditions;

const label = localeTranslator(en);

const model = () =>
  buildFlightPathModel(
    result,
    launch,
    { simName: 'Sim 1', rocketName: 'My <Rocket>', motorName: 'C6' },
    defaultExportOptions(),
    label,
  );

const staged = {
  ...result,
  branches: [
    { name: 'Sustainer', events: result.events, series: result.series },
    { name: 'Booster', events: result.events, series: result.series },
  ],
} as unknown as FlightResult;

// The engine hands over a verbatim copy of the stack's series: index 0 is the shared pad, index 1 separation.
const separated = {
  ...result,
  branches: [
    { name: 'Sustainer', events: result.events, series: result.series },
    {
      name: 'Booster',
      events: [...result.events, { type: 'STAGE_SEPARATION', time: 1.0 }],
      series: result.series,
    },
  ],
} as unknown as FlightResult;

const driftBack = {
  summary: { maxAltitude: 100, maxVelocity: 50, maxAcceleration: 20, timeToApogee: 1, flightTime: 3 },
  series: {
    time: [0, 1, 2, 3],
    altitude: [0, 100, 50, 0],
    velocity: [0, 50, 10, 5],
    acceleration: [20, 5, -2, -9.8],
    Px: [0, 0, 0, 0],
    Py: [0, 150, 300, 50],
  },
  events: [
    { type: 'LIFTOFF', time: 0 },
    { type: 'APOGEE', time: 1 },
    { type: 'GROUND_HIT', time: 3 },
  ],
} as unknown as FlightResult;

const neverLanded = {
  ...result,
  events: [
    { type: 'LIFTOFF', time: 0.0 },
    { type: 'APOGEE', time: 1.0 },
  ],
} as unknown as FlightResult;

const asBalloonText = (kml: string): string => kml.replace(/&lt;\/?b&gt;/g, '').replace(/&lt;br\/&gt;/g, '\n');

const build = (res: FlightResult, over: Partial<ReturnType<typeof defaultExportOptions>> = {}, site = launch) =>
  buildFlightPathModel(
    res,
    site,
    { simName: 'Sim 1', rocketName: 'My <Rocket>', motorName: 'C6' },
    { ...defaultExportOptions(), ...over },
    label,
  );

describe('hexToRgbInt', () => {
  it('packs #rrggbb into one 0xRRGGBB integer', () => {
    expect(hexToRgbInt('#ff8800')).toBe(0xff8800);
    expect(hexToRgbInt('ff8800')).toBe(0xff8800);
    expect(hexToRgbInt('#000000')).toBe(0);
    expect(hexToRgbInt('#FFFFFF')).toBe(0xffffff);
  });

  it('reads unparseable input as black rather than NaN or part of it', () => {
    // Google Earth rejects a placemark with `NaN` in its color.
    for (const bad of ['', '#', 'rebeccapurple', '#zzzzzz', '  ', '12zz']) {
      expect(hexToRgbInt(bad), `hexToRgbInt(${JSON.stringify(bad)})`).toBe(0);
    }
  });

  it('reads an 8-digit #rrggbbaa as its color, dropping the alpha', () => {
    expect(hexToRgbInt('#ff8800cc')).toBe(0xff8800);
  });

  it('expands the 3-digit shorthand, as every color reader does', () => {
    expect(hexToRgbInt('#f80')).toBe(0xff8800);
  });
});

// Desktop OpenRocket templates need these fields; Mustache renders a missing key as "" with no error.
describe('desktop model parity', () => {
  it('gives each branch a palette color and contiguous index', () => {
    const m = build(staged);
    expect(m.branches.map((b) => b.index)).toEqual([0, 1]);
    expect(m.branches[0]!.colorRgb).toBe('0072bd');
    expect(m.branches[1]!.colorRgb).toBe('d95319');
  });

  it('writes KML colors as aabbggrr, not the rgb it started from', () => {
    const b = build(staged).branches[0]!;
    expect(b.pathColorKml).toBe('ffbd7200');
    expect(b.groundColorKml).toBe('ff552dff');
    expect(b.pinColorKml).toBe('ffbd7200');
  });

  it('renders every color opaque, whether defaulted or picked', () => {
    const defaulted = build(staged).branches[0]!;
    const picked = build(staged, {
      branchGroundColors: new Map([[0, 0xff2d55]]),
    }).branches[0]!;
    expect(picked.groundColorKml).toBe(defaulted.groundColorKml);
    for (const c of [defaulted.pathColorKml, defaulted.groundColorKml, defaulted.pinColorKml]) {
      expect(c.slice(0, 2)).toBe('ff');
    }
  });

  it('qualifies waypoint labels only when the flight actually staged', () => {
    const single = build(result).branches[0]!;
    const apogee = single.waypoints.find((w) => w.type === 'apogee')!;
    expect(apogee.qualifiedLabel).toBe(apogee.label);

    const both = build(staged);
    expect(both.branches[0]!.waypoints.find((w) => w.type === 'apogee')!.qualifiedLabel).toBe('Sustainer Apogee');
    expect(both.branches[1]!.waypoints.find((w) => w.type === 'apogee')!.qualifiedLabel).toBe('Booster Apogee');
  });

  it('names the branch on every waypoint', () => {
    const m = build(staged);
    expect(m.branches[1]!.waypoints.every((w) => w.branchName === 'Booster')).toBe(true);
  });

  it('resolves an automatic altitude reference from the launch altitude', () => {
    expect(resolveAltitudeReference('automatic', 0)).toBe('ground');
    expect(resolveAltitudeReference('automatic', 1600)).toBe('sealevel');
    expect(resolveAltitudeReference('automatic', NaN)).toBe('ground');
    expect(resolveAltitudeReference('ground', 1600)).toBe('ground');
  });

  it('carries the KML altitude and its mode together', () => {
    const sea = build(result, { altitudeReference: 'sealevel', waypointAltitudeReference: 'sealevel' });
    const apogee = sea.branches[0]!.waypoints.find((w) => w.type === 'apogee')!;
    expect(sea.kmlAltitudeMode).toBe('absolute');
    expect(apogee.altitudeAglMeters).toBeCloseTo(100, 6);
    expect(apogee.altitudeKmlMeters).toBeCloseTo(1700, 6);

    const ground = build(result, { altitudeReference: 'ground', waypointAltitudeReference: 'ground' });
    const groundApogee = ground.branches[0]!.waypoints.find((w) => w.type === 'apogee')!;
    expect(ground.kmlAltitudeMode).toBe('relativeToGround');
    expect(groundApogee.altitudeKmlMeters).toBeCloseTo(100, 6);
  });

  it('gives path points the same two altitudes as waypoints', () => {
    const m = build(result, { altitudeReference: 'sealevel' });
    const peak = m.branches[0]!.path.find((pt) => pt.altitudeAglMeters === 100)!;
    expect(peak.altitudeKmlMeters).toBeCloseTo(1700, 6);
    expect(peak.altitudeMslMeters).toBeCloseTo(1700, 6);
  });

  it('passes the display toggles through for templates to gate on', () => {
    const m = build(result, { showWaypointLabels: false, colorWaypointPins: false });
    expect(m.showWaypointLabels).toBe(false);
    expect(m.colorWaypointPins).toBe(false);
  });

  it('leaves no model field empty that a template would render blank', () => {
    const m = build(staged);
    for (const [key, value] of Object.entries(m)) {
      expect(value, `model.${key}`).toBeDefined();
    }
    for (const b of m.branches) {
      for (const [key, value] of Object.entries(b)) expect(value, `branch.${key}`).toBeDefined();
      for (const w of b.waypoints) {
        for (const [key, value] of Object.entries(w)) expect(value, `waypoint.${key}`).toBeDefined();
      }
      for (const pt of b.path) {
        for (const [key, value] of Object.entries(pt)) expect(value, `pathPoint.${key}`).toBeDefined();
      }
    }
  });
});

describe('stage track start', () => {
  it('drops the ascent a booster only flew bolted to the sustainer', () => {
    const m = build(separated);
    const booster = m.branches[1]!;
    expect(booster.path[0]!.time).toBeCloseTo(1, 6);
    expect(booster.path.some((pt) => pt.time === 0)).toBe(false);
    expect(m.branches[0]!.path[0]!.time).toBeCloseTo(0, 6);
  });

  it('keeps the whole track when asked to start every stage on the pad', () => {
    const m = build(separated, { stageTrackStart: 'pad' });
    expect(m.branches[1]!.path[0]!.time).toBeCloseTo(0, 6);
  });

  it('keeps the whole track for a branch that never recorded a separation', () => {
    const m = build(staged);
    expect(m.branches[1]!.path[0]!.time).toBeCloseTo(0, 6);
  });

  it('gives the pad waypoint to the stack alone', () => {
    const m = build(staged);
    expect(m.branches[0]!.waypoints.some((w) => w.type === 'pad')).toBe(true);
    expect(m.branches[1]!.waypoints.some((w) => w.type === 'pad')).toBe(false);
  });

  it("scans a booster's peak speed from separation, not from the pad", () => {
    const slowAfter = {
      ...result,
      series: { ...result.series, velocity: [0, 50, 10] },
      branches: [
        { name: 'Sustainer', events: result.events, series: result.series },
        {
          name: 'Booster',
          events: [...result.events, { type: 'STAGE_SEPARATION', time: 2.0 }],
          series: result.series,
        },
      ],
    } as unknown as FlightResult;
    const booster = build(slowAfter).branches[1]!;
    const peak = booster.waypoints.find((w) => w.type === 'maxvelocity')!;
    expect(peak.time).toBeCloseTo(2, 6);
  });
});

describe('mission name', () => {
  it('names the document, the folders and the tracks, but not the markers', () => {
    const m = build(staged, { missionName: 'Sod Blaster' });
    expect(m.title).toBe('Sod Blaster Sim 1');
    expect(m.branches.map((b) => b.name)).toEqual(['Sod Blaster Sustainer', 'Sod Blaster Booster']);
    expect(renderKml(m)).toContain('<name>Sod Blaster Sustainer flight path</name>');
    expect(m.branches[0]!.waypoints.find((w) => w.type === 'apogee')!.qualifiedLabel).toBe('Sustainer Apogee');
  });

  it('reaches the markers only when asked to', () => {
    const m = build(staged, { missionName: 'Sod Blaster', labelWaypointsWithMission: true });
    const apogee = m.branches[0]!.waypoints.find((w) => w.type === 'apogee')!;
    expect(apogee.qualifiedLabel).toBe('Sod Blaster Sustainer Apogee');
    expect(apogee.label).toBe('Apogee');
  });

  it('does not double a mission the name already leads with', () => {
    const m = build(staged, { missionName: 'Sustainer', labelWaypointsWithMission: true });
    expect(m.branches[0]!.name).toBe('Sustainer');
    expect(m.branches[0]!.waypoints.find((w) => w.type === 'apogee')!.qualifiedLabel).toBe('Sustainer Apogee');
    expect(build(staged, { missionName: 'sustainer' }).branches[0]!.name).toBe('Sustainer');
  });

  it('leaves every name exactly as it was when there is no mission', () => {
    const m = build(staged);
    expect(m.title).toBe('Sim 1');
    expect(m.branches.map((b) => b.name)).toEqual(['Sustainer', 'Booster']);
    expect(m.branches[1]!.waypoints.find((w) => w.type === 'apogee')!.qualifiedLabel).toBe('Booster Apogee');
  });

  it('treats a blank mission as no mission, not as a leading space', () => {
    const m = build(staged, { missionName: '   ', labelWaypointsWithMission: true });
    expect(m.title).toBe('Sim 1');
    expect(m.branches[0]!.name).toBe('Sustainer');
    expect(m.branches[0]!.waypoints.find((w) => w.type === 'apogee')!.qualifiedLabel).toBe('Sustainer Apogee');
    expect(build(staged, { missionName: '  Sod Blaster  ' }).title).toBe('Sod Blaster Sim 1');
  });
});

describe('stage colors', () => {
  it('indexes the palette with a floor-mod, so any stage count works', () => {
    expect(defaultBranchColor(0)).toBe(0x0072bd);
    expect(defaultBranchColor(10)).toBe(0x0072bd);
    expect(defaultBranchColor(-1)).toBe(0x556b2f);
  });

  it('lets an override replace one stage and leaves the rest on the palette', () => {
    const m = build(staged, { branchColors: new Map([[1, 0x112233]]) });
    expect(m.branches[0]!.colorRgb).toBe('0072bd');
    expect(m.branches[1]!.colorRgb).toBe('112233');
  });

  it('a stage path color can be set on its own', () => {
    const b = build(staged, { branchColors: new Map([[0, 0x112233]]) }).branches[0]!;
    expect(b.pathColorKml).toBe('ff332211'); // KML is aabbggrr, so 112233 -> ff332211
    expect(b.groundColorKml).toBe('ff552dff');
    expect(b.pinColorKml).toBe('ffbd7200');
  });

  it('a stage ground-track color can be set on its own', () => {
    const b = build(staged, { branchGroundColors: new Map([[0, 0x112233]]) }).branches[0]!;
    expect(b.groundColorKml).toBe('ff332211');
    expect(b.pathColorKml).toBe('ffbd7200');
    expect(b.pinColorKml).toBe('ffbd7200');
  });

  it('a stage pin color can be set on its own', () => {
    const b = build(staged, { branchPinColors: new Map([[0, 0x112233]]) }).branches[0]!;
    expect(b.pinColorKml).toBe('ff332211');
    expect(b.pathColorKml).toBe('ffbd7200');
    expect(b.groundColorKml).toBe('ff552dff');
  });

  it('a stage can carry three independent colors at once', () => {
    const b = build(staged, {
      branchColors: new Map([[0, 0x112233]]),
      branchGroundColors: new Map([[0, 0x445566]]),
      branchPinColors: new Map([[0, 0x778899]]),
    }).branches[0]!;
    expect(b.colorRgb).toBe('112233');
    expect(b.groundColorRgb).toBe('445566');
    expect(b.pinColorRgb).toBe('778899');
    expect(b.pathColorKml).toBe('ff332211');
    expect(b.groundColorKml).toBe('ff665544');
    expect(b.pinColorKml).toBe('ff998877');
  });

  it('each color lands on its own KML element', () => {
    const kml = renderKml(
      build(staged, {
        branchColors: new Map([[0, 0x112233]]),
        branchGroundColors: new Map([[0, 0x445566]]),
        branchPinColors: new Map([[0, 0x778899]]),
      }),
    );
    expect(kml).toContain('<Style id="flightPath0"><LineStyle><color>ff332211</color>');
    expect(kml).toContain('<Style id="groundTrack0"><LineStyle><color>ff665544</color>');
    const iconStyle = /<Style id="waypoint0">[\s\S]*?<IconStyle>\s*<color>([0-9a-f]{8})<\/color>/.exec(kml);
    expect(iconStyle?.[1]).toBe('ff998877');
    expect(kml).toContain('<Style id="flightPath0"><LineStyle><color>ff332211</color>');
  });

  it('the ground palette contrasts with the path palette per stage', () => {
    for (let i = 0; i < 10; i++) {
      expect(defaultGroundColor(i)).not.toBe(defaultBranchColor(i));
    }
    expect(defaultGroundColor(0)).toBe(0xff2d55);
    expect(defaultGroundColor(10)).toBe(0xff2d55);
    expect(defaultGroundColor(-1)).toBe(0xe74c3c);
    expect(defaultPinColor(3)).toBe(defaultBranchColor(3));
  });

  it('offers the color picker exactly the branches the model will number', () => {
    const meta = { simName: 'Sim 1', rocketName: 'My <Rocket>', motorName: 'C6' };
    expect(exportBranchNames(staged, meta, label)).toEqual(build(staged).branches.map((b) => b.name));
    expect(exportBranchNames(result, meta, label)).toEqual(['My <Rocket>']);
  });

  it('names an unnamed stage as every view does, and an unnamed flight in the export language', () => {
    const unnamed = {
      ...staged,
      branches: [staged.branches![0]!, { ...staged.branches![1]!, name: '  ' }],
    } as unknown as FlightResult;
    const meta = { simName: 'Sim 1', rocketName: 'My <Rocket>', motorName: 'C6' };
    expect(exportBranchNames(unnamed, meta, label)).toEqual(['Sustainer', 'Stage 2']);
    const kml = renderKml(build(unnamed));
    expect(kml).toContain('<name>Stage 2</name>');
    expect(kml).not.toContain('<name></name>');
    const es_ = localeTranslator(es);
    expect(exportBranchNames(result, { simName: '', rocketName: '', motorName: '' }, es_)).toEqual([
      es.pathExport.doc.flight,
    ]);
  });
});

describe('buildFlightPathModel', () => {
  it('projects Px/Py drift onto lat/lon about the launch site', () => {
    const m = model();
    const b = m.branches[0]!;
    const pad = b.waypoints.find((w) => w.type === 'pad')!;
    expect(pad.latitude).toBeCloseTo(40, 6);
    expect(pad.longitude).toBeCloseTo(-105, 6);
    expect(pad.altitudeMslMeters).toBe(1600);

    const apogee = b.waypoints.find((w) => w.type === 'apogee')!;
    expect(apogee.latitude).toBeGreaterThan(40);
    expect(apogee.longitude).toBeGreaterThan(-105);
    expect(apogee.altitudeMslMeters).toBe(1700);
  });

  it('emits all enabled waypoints, sorted by time, with recovery device name', () => {
    const m = model();
    const w = m.branches[0]!.waypoints;
    const types = w.map((x) => x.type);
    expect(types).toContain('pad');
    expect(types).toContain('liftoff');
    expect(types).toContain('apogee');
    expect(types).toContain('recovery');
    expect(types).toContain('landing');
    expect(types).toContain('maxvelocity');
    expect(types).toContain('maxacceleration');
    const times = w.map((x) => x.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(w.find((x) => x.type === 'recovery')!.label).toBe('Main chute Ejection');
    expect(w.find((x) => x.type === 'maxvelocity')!.timeStr).toBe('1.00');
  });

  it('honors the waypoint selection', () => {
    const opts = defaultExportOptions();
    opts.waypoints = new Set<WaypointKind>(['apogee']);
    const m = buildFlightPathModel(result, launch, { simName: 'S', rocketName: 'R', motorName: 'C6' }, opts, label);
    expect(m.branches[0]!.waypoints.map((w) => w.type)).toEqual(['apogee']);
  });

  it('samples the path with stride and always keeps the final point', () => {
    const opts = defaultExportOptions();
    opts.pathStride = 2;
    const m = buildFlightPathModel(result, launch, { simName: 'S', rocketName: 'R', motorName: 'C6' }, opts, label);
    expect(m.branches[0]!.path.map((p) => p.time)).toEqual([0, 2]);
  });
});

describe('launch position fallback', () => {
  const site = (lat: number, lon: number) => ({ ...launch, latitudeDeg: lat, longitudeDeg: lon }) as LaunchConditions;

  it('exports from the Kennedy Space Center only when both coordinates are zero', () => {
    const m = build(result, {}, site(0, 0));
    expect(m.launchLatitude).toBe(EXPORT_FALLBACK_LATITUDE);
    expect(m.launchLongitude).toBe(EXPORT_FALLBACK_LONGITUDE);
  });

  it('leaves a single zero alone -- the meridian and the equator are real places', () => {
    // Narrower than desktop OpenRocket, which relocates a site with a zero in either coordinate.
    for (const [lat, lon] of [
      [40, -105],
      [51.48, 0],
      [0, -105],
    ] as const) {
      const m = build(result, {}, site(lat, lon));
      expect([m.launchLatitude, m.launchLongitude]).toEqual([lat, lon]);
    }
  });

  it('flags exactly the positions it substitutes', () => {
    expect(hasLaunchPosition(site(40, -105))).toBe(true);
    expect(hasLaunchPosition(site(51.48, 0))).toBe(true);
    expect(hasLaunchPosition(site(0, -105))).toBe(true);
    expect(hasLaunchPosition(site(0, 0))).toBe(false);
  });

  it("writes the kernel's own latitude and longitude when the run recorded them", () => {
    const phi = [40, 40.0011, 40.0022];
    const lam = [-105, -104.9993, -104.9987];
    const withKernel = { ...result, series: { ...result.series, φ: phi, λ: lam } } as unknown as FlightResult;
    const m = build(withKernel, {}, site(40, -105));
    const b = m.branches[0]!;
    expect(b.path.map((p) => [p.latitude, p.longitude])).toEqual(phi.map((la, k) => [la, lam[k]]));
    const landing = b.waypoints.find((w) => w.type === 'landing')!;
    expect([landing.latitude, landing.longitude]).toEqual([40.0022, -104.9987]);
    expect([b.landingLatitudeStr, b.landingLongitudeStr]).toEqual(['40.002200', '-104.998700']);
  });

  it("projects with the kernel's spherical model for a result saved without them", () => {
    const last = build(result, {}, site(40, -105)).branches[0]!.path.slice(-1)[0]!;
    const want = offsetToLatLon(40, -105, { east: 100, north: 200 });
    expect(last.latitude).toBeCloseTo(want.lat, 9);
    expect(last.longitude).toBeCloseTo(want.lon, 9);
  });

  it('projects about the substitute site, since the kernel flew from (0, 0)', () => {
    const withKernel = {
      ...result,
      series: { ...result.series, φ: [0, 0.0009, 0.0018], λ: [0, 0.0004, 0.0009] },
    } as unknown as FlightResult;
    const last = build(withKernel, {}, site(0, 0)).branches[0]!.path.slice(-1)[0]!;
    const want = offsetToLatLon(EXPORT_FALLBACK_LATITUDE, EXPORT_FALLBACK_LONGITUDE, { east: 100, north: 200 });
    expect(last.latitude).toBeCloseTo(want.lat, 9);
    expect(last.longitude).toBeCloseTo(want.lon, 9);
  });
});

describe('track and waypoint altitude references', () => {
  it('resolves the two independently', () => {
    const m = build(result, { altitudeReference: 'sealevel', waypointAltitudeReference: 'clamped' });
    expect(m.kmlAltitudeMode).toBe('absolute');
    expect(m.kmlWaypointAltitudeMode).toBe('clampToGround');
    expect(m.branches[0]!.path[1]!.altitudeKmlMeters).toBeCloseTo(1700, 6);
    expect(m.branches[0]!.waypoints.find((w) => w.type === 'apogee')!.altitudeKmlMeters).toBeCloseTo(100, 6);
  });

  it('tessellates a clamped track, and only a clamped one', () => {
    expect(build(result, { altitudeReference: 'clamped' }).tessellatePath).toBe(true);
    expect(build(result, { altitudeReference: 'sealevel' }).tessellatePath).toBe(false);
  });

  it('drops the shadow for whichever half is already on the ground', () => {
    const both = build(result, { drawShadow: true, altitudeReference: 'ground', waypointAltitudeReference: 'ground' });
    expect([both.extrudePath, both.extrudeWaypoints]).toEqual([true, true]);

    const mixed = build(result, {
      drawShadow: true,
      altitudeReference: 'clamped',
      waypointAltitudeReference: 'sealevel',
    });
    expect([mixed.extrudePath, mixed.extrudeWaypoints]).toEqual([false, true]);

    const off = build(result, { drawShadow: false, altitudeReference: 'sealevel' });
    expect([off.extrudePath, off.extrudeWaypoints]).toEqual([false, false]);
  });
});

describe('renderKml', () => {
  const kml = renderKml(model());
  it('is well-formed KML with a document name and both track styles', () => {
    expect(kml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<kml')).toBe(true);
    expect(kml).toContain('<name>Sim 1</name>');
    expect(kml).toContain('id="flightPath0"');
    expect(kml).toContain('id="groundTrack0"');
    expect(kml.trimEnd().endsWith('</kml>')).toBe(true);
  });
  it('places the track in the altitude mode the model resolved', () => {
    const ground = renderKml(build(result, {}, { ...launch, launchAltitudeM: 0 } as LaunchConditions));
    expect(ground).toContain('<altitudeMode>relativeToGround</altitudeMode>');
    expect(ground).not.toContain('<altitudeMode>absolute</altitudeMode>');
    expect(kml).toContain('<altitudeMode>absolute</altitudeMode>');
    expect(kml).not.toContain('<altitudeMode>relativeToGround</altitudeMode>');
    expect(ground).toContain('<altitudeMode>clampToGround</altitudeMode>');
    expect(kml).toContain('<altitudeMode>clampToGround</altitudeMode>');
  });

  it('gives each stage its own styles, colors and qualified waypoint names', () => {
    const k = renderKml(build(staged));
    expect(k).toContain('id="flightPath0"');
    expect(k).toContain('id="flightPath1"');
    expect(k).toContain('<styleUrl>#waypoint1</styleUrl>');
    const colors = [...k.matchAll(/<LineStyle><color>([0-9a-f]{8})</g)].map((m) => m[1]);
    expect(new Set(colors).size).toBeGreaterThan(1);
    expect(k).toContain('<name>Booster Apogee</name>');
  });

  it('writes the two altitude modes into the halves they belong to', () => {
    const k = renderKml(build(result, { altitudeReference: 'sealevel', waypointAltitudeReference: 'clamped' }));
    const point = k.slice(k.indexOf('<Point>'), k.indexOf('</Point>'));
    const line = k.slice(k.indexOf('<LineString>'), k.indexOf('</LineString>'));
    expect(point).toContain('<altitudeMode>clampToGround</altitudeMode>');
    expect(line).toContain('<altitudeMode>absolute</altitudeMode>');
  });

  it('emits extrude as a section, so an older template is unaffected', () => {
    expect(kml).not.toContain('<extrude>');
    const shadow = renderKml(build(result, { drawShadow: true, altitudeReference: 'sealevel' }));
    expect(shadow).toContain('<extrude>1</extrude>');
    expect(shadow).not.toContain('<extrude></extrude>');
  });

  it('tessellates the flight-path line only when it is clamped', () => {
    const clamped = renderKml(build(result, { altitudeReference: 'clamped' }));
    const line = clamped.slice(clamped.indexOf('<LineString>'), clamped.indexOf('</LineString>'));
    expect(line).toContain('<tessellate>1</tessellate>');
    expect(line).toContain('<altitudeMode>clampToGround</altitudeMode>');
  });

  it('drops the pin icon when color pins are turned off', () => {
    expect(kml).toContain('maps.google.com/mapfiles/kml/pushpin');
    expect(renderKml(build(result, { colorWaypointPins: false }))).not.toContain('maps.google.com');
  });

  it('hides waypoint names with a zero label scale, keeping the clickable pin', () => {
    expect(kml).not.toContain('<LabelStyle>');
    const quiet = renderKml(build(result, { showWaypointLabels: false }));
    expect(quiet).toContain('<LabelStyle><scale>0</scale></LabelStyle>');
    expect(quiet).toContain('<name>Apogee</name>');
  });

  it('writes coordinates as lon,lat,alt', () => {
    // KML coordinates are lon,lat,alt.
    expect(kml).toContain('<coordinates>-105,40,1600</coordinates>');
  });
  it('omits the flight-path line when disabled', () => {
    const opts = defaultExportOptions();
    opts.includeFlightPath = false;
    opts.includeGroundTrack = false;
    const k = renderKml(
      buildFlightPathModel(result, launch, { simName: 'S', rocketName: 'R', motorName: 'C6' }, opts, label),
    );
    expect(k).not.toContain('#flightPath');
    expect(k).not.toContain('#groundTrack');
  });
});

describe('flight summary', () => {
  it('carries the whole-flight numbers the balloons report', () => {
    const m = model();
    expect(m.maxAltitude).toBe('100.0');
    expect(m.maxRange).toBe('223.6');
    expect(m.timeToApogee).toBe('1.0');
    expect(m.flightTime).toBe('2.0');
    expect([m.velocityUnit, m.accelerationUnit]).toEqual(['m/s', 'm/s²']);
    expect([m.launchLatitudeStr, m.launchLongitudeStr]).toEqual(['40.000000', '-105.000000']);
    expect(m.launchAltitude).toBe('1600.0');
  });

  it('reports where and when each stage came down', () => {
    const branch = build(driftBack).branches[0]!;
    expect(branch.hasLanding).toBe(true);
    expect(branch.landingDistance).toBe('50.0');
    expect(branch.landingBearing).toBe('0');
    expect(branch.landingTime).toBe('3.0');
    expect(branch.landingLatitudeStr).toBe('40.000450');
    expect(branch.landingLongitudeStr).toBe('-105.000000');
  });

  it('reports the FARTHEST point as the range, not the landing point', () => {
    const m = build(driftBack);
    expect(m.branches[0]!.maxRangeMeters).toBeCloseTo(300, 6);
    expect(m.maxRange).toBe('300.0');
    expect(m.branches[0]!.landingDistance).toBe('50.0');
  });

  it('scans a separated stage range over the WHOLE branch', () => {
    const m = build(separated);
    expect(m.branches[1]!.maxRangeMeters).toBeCloseTo(m.branches[0]!.maxRangeMeters, 6);
  });

  it('reports no landing for a flight that never hit the ground', () => {
    const branch = build(neverLanded).branches[0]!;
    expect(branch.hasLanding).toBe(false);
    expect([branch.landingDistance, branch.landingBearing, branch.landingTime]).toEqual(['', '', '']);
    expect([branch.landingLatitudeStr, branch.landingLongitudeStr]).toEqual(['', '']);
    const kml = renderKml(build(neverLanded));
    expect(kml).not.toContain('Landing:');
    expect(kml).not.toContain('Landing coordinates:');
    expect(kml).not.toContain(' landing: ');
    expect(kml).toContain('Max range:');
  });

  it('finds the landing even when the landing waypoint is switched off', () => {
    const m = build(driftBack, { waypoints: new Set<WaypointKind>(['apogee']) });
    expect(m.branches[0]!.hasLanding).toBe(true);
    expect(m.branches[0]!.landingDistance).toBe('50.0');
  });
});

describe('kernel component names', () => {
  // TeaVM has no resource bundles, so `DebugTranslator` names an unrenamed part `[Parachute.Parachute]`.
  const unnamed = {
    ...result,
    events: [
      { type: 'LIFTOFF', time: 0.0 },
      { type: 'APOGEE', time: 1.0 },
      { type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 1.0, source: '[Parachute.Parachute]' },
      { type: 'GROUND_HIT', time: 2.0 },
    ],
  } as unknown as FlightResult;

  it('never writes a bundle key where a component name belongs', () => {
    const m = build(unnamed);
    const recovery = m.branches[0]!.waypoints.find((w) => w.type === 'recovery')!;
    expect(recovery.device).toBe('Parachute');

    const kml = renderKml(m);
    expect(kml).not.toContain('[Parachute.Parachute]');
    expect(asBalloonText(kml)).toContain('Device: Parachute');
  });

  it('names an unnamed device pin for the EVENT alone', () => {
    const m = build(unnamed);
    expect(m.branches[0]!.waypoints.find((w) => w.type === 'recovery')!.label).toBe('Ejection');
    expect(renderKml(m)).toContain('<name>Ejection</name>');
  });

  it('qualifies the event word with a device the user named', () => {
    const dual = {
      ...result,
      events: [
        { type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 1.0, source: 'Drogue' },
        { type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 2.0, source: 'Main' },
      ],
    } as unknown as FlightResult;
    const m = build(dual);
    expect(m.branches[0]!.waypoints.filter((w) => w.type === 'recovery').map((w) => w.label)).toEqual([
      'Drogue Ejection',
      'Main Ejection',
    ]);
    const kml = renderKml(m);
    expect(kml).toContain('<name>Drogue Ejection</name>');
    expect(kml).toContain('<name>Main Ejection</name>');
    expect(kml).not.toContain('<name>Drogue</name>');
    expect(kml).not.toContain('<name>Main</name>');
  });

  it('yields a plain Ejection when no component raised the deployment', () => {
    const m = build({
      ...result,
      events: [{ type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 1.0 }],
    } as unknown as FlightResult);
    const recovery = m.branches[0]!.waypoints.find((w) => w.type === 'recovery')!;
    expect(recovery.label).toBe('Ejection');
    expect(recovery.device).toBe('');
    expect(asBalloonText(renderKml(m))).not.toContain('Device:');
  });

  it('does not double a device already named for the event', () => {
    // One direction only: widening the guard would change stage names too.
    const named = (source: string) =>
      build({
        ...result,
        events: [{ type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 1.0, source }],
      } as unknown as FlightResult).branches[0]!.waypoints.find((w) => w.type === 'recovery')!.label;
    expect(named('Ejection')).toBe('Ejection');
    expect(named('Drogue')).toBe('Drogue Ejection');
  });

  it('stacks the stage and the device on a staged flight', () => {
    const staged2 = (source: string) =>
      build({
        ...result,
        branches: [
          { name: 'Sustainer', events: [], series: result.series },
          {
            name: 'Booster',
            events: [{ type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 1.0, source }],
            series: result.series,
          },
        ],
      } as unknown as FlightResult).branches[1]!.waypoints.find((w) => w.type === 'recovery')!.qualifiedLabel;

    expect(staged2('Drogue')).toBe('Booster Drogue Ejection');
    expect(staged2('Booster Chute')).toBe('Booster Chute Ejection');
  });

  it('names the device in the EXPORT language, not the app language', () => {
    const kml = renderKml(
      buildFlightPathModel(
        unnamed,
        launch,
        { simName: 'Sim 1', rocketName: 'R', motorName: 'C6' },
        defaultExportOptions(),
        localeTranslator(es),
      ),
    );
    expect(kml).toContain(`<name>${es.pathExport.wp.recovery}</name>`);
    expect(asBalloonText(kml)).toContain(`${es.pathExport.doc.device}: ${es.part.parachute}`);
    expect(kml).not.toContain('Parachute');
  });

  it('leaves a name the user actually typed alone', () => {
    const m = build(result);
    const recovery = m.branches[0]!.waypoints.find((w) => w.type === 'recovery')!;
    expect(recovery.device).toBe('Main chute');
  });
});

describe('export language', () => {
  const esDoc = es.pathExport.doc;
  const fill = (template: string, vars: Record<string, string>): string =>
    template.replace(/{{(\w+)}}/g, (_m, name: string) => vars[name] ?? '');

  const spanish = () =>
    renderKml(
      buildFlightPathModel(
        result,
        launch,
        { simName: 'Sim 1', rocketName: 'My <Rocket>', motorName: 'C6' },
        defaultExportOptions(),
        localeTranslator(es),
      ),
    );

  it('writes every string in the file, not just the waypoint names', () => {
    const k = asBalloonText(spanish());
    expect(k).toContain(`<name>${es.pathExport.wp.apogee}</name>`);
    expect(k).toContain(`${esDoc.flightPath}</name>`);
    expect(k).toContain(`${esDoc.groundTrack}</name>`);
    expect(k).toContain(`${esDoc.maxAltitude}: 100.0 m`);
    expect(k).toContain(`${esDoc.maxRange}: 223.6 m ${esDoc.fromThePad}`);
    expect(k).toContain(`${esDoc.coordinates}: 40.000899, -104.999413`);
    expect(k).toContain(`${esDoc.device}: Main chute`);
    expect(k).not.toContain('Max altitude');
    expect(k).not.toContain('flight path</name>');
  });

  it('puts the stage name where the language puts it', () => {
    // A balloon name is escaped for HTML and then for XML.
    expect(asBalloonText(spanish())).toContain(`${fill(esDoc.stageLanding, { stage: 'My &amp;lt;Rocket&amp;gt;' })}:`);
    expect(asBalloonText(renderKml(model()))).toContain('My &amp;lt;Rocket&amp;gt; landing:');
  });

  it('orders a distance and a bearing the way the language does', () => {
    const expected = fill(esDoc.distanceBearing, { distance: '223.6', unit: 'm', bearing: '27°' });
    expect(spanish()).toContain(expected);
    expect(renderKml(model())).toContain('223.6 m at 27\u00b0');
  });

  it("writes the bearing in the reader's angle unit", () => {
    const inRadians = buildFlightPathModel(
      result,
      launch,
      { simName: 'Sim 1', rocketName: 'My <Rocket>', motorName: 'C6' },
      defaultExportOptions(),
      label,
      'rad',
    );
    const kml = renderKml(inRadians);
    expect(kml).toContain('223.6 m at 0.46 rad');
    expect(kml).not.toContain('223.6 m at 27');
  });

  it('leaves the numbers and the geometry alone', () => {
    const k = spanish();
    expect(k).toContain('<coordinates>-105,40,1600</coordinates>');
    expect(k).toContain('<altitudeMode>absolute</altitudeMode>');
    expect(k).toContain('id="flightPath0"');
  });
});

describe('KML summary balloons', () => {
  const kml = renderKml(model());

  it('bolds every label, and leaves no line without one', () => {
    expect(kml).toContain('&lt;b&gt;Max altitude:&lt;/b&gt; 100.0');
    expect(kml).toContain('&lt;b&gt;Time:&lt;/b&gt; T+');
    for (const [, body] of kml.matchAll(/<description>([\s\S]*?)<\/description>/g)) {
      const lines = body!.split('&lt;br/&gt;').filter((l) => l.trim());
      expect(lines.length).toBe(body!.split('&lt;b&gt;').length - 1);
    }
  });

  it('puts the flight summary on the document', () => {
    const doc = asBalloonText(kml.slice(0, kml.indexOf('<Style')));
    expect(doc).toContain('Configuration: C6');
    expect(doc).toContain('Launch site: 40.000000, -105.000000 (lat, lon), 1600.0 m above sea level');
    expect(doc).toContain('Max altitude: 100.0 m');
    expect(doc).toContain('Max velocity: 50.0 m/s');
    expect(doc).toContain('Max acceleration: 20.0 m/s²');
    expect(doc).toContain('Max range: 223.6 m from the pad');
    expect(doc).toContain('Time to apogee: 1.0 s');
    expect(doc).toContain('Flight time: 2.0 s');
    expect(doc).toContain('Rocket: My &amp;lt;Rocket&amp;gt;');
    expect(doc).toContain('landing: 40.001799, -104.998826 (lat, lon); 223.6 m at 27° from the pad; T+2.0 s');
  });

  it('puts the range and the landing on the stage folder', () => {
    const folder = asBalloonText(kml.slice(kml.indexOf('<Folder>'), kml.indexOf('<Placemark>')));
    expect(folder).not.toContain('Stage:');
    expect(folder).toContain('Max range: 223.6 m from the pad');
    expect(folder).toContain('Landing: 40.001799, -104.998826 (lat, lon); 223.6 m at 27° from the pad; T+2.0 s');
  });

  it('puts the point own numbers on each waypoint', () => {
    const at = kml.indexOf('<name>Apogee</name>');
    const apogee = asBalloonText(kml.slice(at, kml.indexOf('</Placemark>', at)));
    expect(apogee).toContain('Time: T+1.0 s');
    expect(apogee).not.toContain('T+1.00 s');
    expect(apogee).toContain('Altitude: 100.0 m above the pad, 1700.0 m above sea level');
    expect(apogee).toContain('Position: 111.8 m at 27° from the pad');
    expect(apogee).toContain('Coordinates: 40.000899, -104.999413 (lat, lon)');
    expect(apogee).not.toContain('Device:');
    expect(asBalloonText(kml)).toContain('Device: Main chute');
  });

  it('writes no Snippet', () => {
    // Google Earth desktop ignores an empty <Snippet>; the web version rejects its maxLines form.
    expect(kml).not.toContain('Snippet');
  });

  it('leaves out a waypoint style that would carry nothing, and the styleUrl to it', () => {
    const plain = renderKml(build(result, { colorWaypointPins: false, showWaypointLabels: true }));
    expect(plain).not.toContain('<Style id="waypoint');
    expect(plain).not.toContain('#waypoint');
    const hidden = renderKml(build(result, { colorWaypointPins: false, showWaypointLabels: false }));
    expect(hidden).toContain('<Style id="waypoint0">');
    expect(hidden.split('<styleUrl>#waypoint0</styleUrl>').length - 1).toBe(hidden.split('<Point>').length - 1);
  });

  it('shows the range and the landing as the different numbers they are', () => {
    const k = renderKml(build(driftBack));
    const doc = asBalloonText(k.slice(0, k.indexOf('<Style')));
    expect(doc).toContain('Max range: 300.0 m from the pad');
    expect(doc).toContain('(lat, lon); 50.0 m at 0° from the pad; T+3.0 s');
  });

  it('leaves the sea-level lines out when the site has no altitude', () => {
    // OpenRocket's launch altitude defaults to 0, which is not a known sea level.
    const k = asBalloonText(renderKml(build(result, {}, { ...launch, launchAltitudeM: 0 } as LaunchConditions)));
    expect(k).not.toContain('above sea level');
    expect(k).toContain('Launch site: 40.000000, -105.000000 (lat, lon)\n');
    expect(k).toContain('above the pad');
  });

  it('leaves the configuration line out when there is no named configuration', () => {
    const m = model();
    m.configuration = '';
    expect(renderKml(m)).not.toContain('Configuration:');
  });

  it('writes no descriptions at all when they are switched off', () => {
    const k = renderKml(build(result, { includeDescriptions: false }));
    expect(k).not.toContain('<description>');
    expect(k).not.toContain('<Snippet>');
    expect(k).toContain('<coordinates>-105,40,1600</coordinates>');
    expect(k).toContain('<name>Apogee</name>');
    expect(k).toContain('id="flightPath0"');
  });
});

describe('renderGpx', () => {
  it('emits waypoints and a track segment', () => {
    const gpx = renderGpx(model());
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain('<wpt lat="40" lon="-105">');
    expect(gpx).toContain('<trkpt lat="40" lon="-105"><ele>1600</ele></trkpt>');
    expect(gpx.trimEnd().endsWith('</gpx>')).toBe(true);
  });
});

describe('renderWaypointCsv', () => {
  it('colors each pin with its stage pin color, as the KML does', () => {
    const m = model();
    const rows = renderWaypointCsv(m).trimEnd().split('\r\n').slice(1);
    const want = m.colorWaypointPins ? `"#${m.branches[0]!.pinColorRgb}"` : '"yellow"';
    expect(rows.every((r) => r.split(',')[5] === want)).toBe(true);
    expect(want).not.toBe('"yellow"');
  });

  it('keeps the fixed yellow when pin coloring is off', () => {
    const rows = renderWaypointCsv(build(result, { colorWaypointPins: false }))
      .trimEnd()
      .split('\r\n')
      .slice(1);
    expect(rows.every((r) => r.split(',')[5] === '"yellow"')).toBe(true);
  });

  it('has the header and one quoted row per waypoint', () => {
    const csv = renderWaypointCsv(model());
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('"altitude(m)","latitude","longitude","label","symbol","color","label_color","name"');
    expect(lines.length).toBe(1 + 7);
    expect(lines[1]!.startsWith('"')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});

describe('escaping', () => {
  it('XML-escapes text fields in KML, and leaves angle brackets out of them', () => {
    const m = model();
    m.branches[0]!.name = 'A & B <c>';
    const kml = renderKml(m);
    expect(kml).toContain('<name>A &amp; B c</name>');
  });

  // Google Earth's default balloon sets `<name>` as HTML, so no value may decode to a raw `<`.
  it('gives no name in KML a way to become markup', () => {
    const m = model();
    const payload = '<img src=x onerror=alert(1)>';
    m.title = payload;
    m.rocketName = payload;
    m.branches[0]!.name = payload;
    const decoded = (tag: string) =>
      [...renderKml(m).matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map((x) =>
        x[1]!
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&amp;/g, '&'),
      );
    const names = decoded('name');
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n).not.toMatch(/[<>]/);
    const descriptions = decoded('description');
    expect(descriptions.length).toBeGreaterThan(0);
    for (const d of descriptions) expect(d).not.toContain('<img');
  });
  it('CSV-escapes embedded quotes by doubling', () => {
    const m = model();
    m.rocketName = 'He said "hi"';
    const csv = renderWaypointCsv(m);
    expect(csv).toContain('He said ""hi""');
  });
});

describe('renderUserTemplate (Mustache)', () => {
  it('renders a template using the desktop model field names', () => {
    const src =
      'Rocket: {{rocketName}} / Motor: {{motor}}\n{{#branches}}{{name}}: {{#waypoints}}[{{label}}]{{/waypoints}}{{/branches}}';
    const out = renderUserTemplate(src, 'txt', model());
    expect(out).toContain('Rocket: My <Rocket> / Motor: C6');
    expect(out).toContain('[Apogee]');
  });

  it('reproduces the reference KML coordinate loop with hasPath/section gating', () => {
    const src = [
      '<name>{{title}}</name>',
      '{{#branches}}{{#includeFlightPath}}{{#hasPath}}',
      '<coords>{{#path}}{{longitude}},{{latitude}},{{altitudeMslMeters}} {{/path}}</coords>',
      '{{/hasPath}}{{/includeFlightPath}}{{/branches}}',
    ].join('\n');
    const out = renderUserTemplate(src, 'kml', model());
    expect(out).toContain('<name>Sim 1</name>');
    expect(out).toContain('-105,40,1600');
  });

  it('escapes by extension: XML for kml, doubled quotes for csv, none for txt', () => {
    const m = model();
    m.title = 'A & B "<c>"';
    expect(renderUserTemplate('{{title}}', 'kml', m)).toBe('A &amp; B &quot;c&quot;');
    expect(renderUserTemplate('{{title}}', 'csv', m)).toBe('A & B ""<c>""');
    expect(renderUserTemplate('{{title}}', 'txt', m)).toBe('A & B "<c>"');
  });

  it('restores the escaper after rendering (no leakage between formats)', () => {
    const m = model();
    m.title = '<x>';
    renderUserTemplate('{{title}}', 'kml', m);
    expect(renderUserTemplate('{{title}}', 'txt', m)).toBe('<x>');
  });
});

describe('EXPORT_FORMATS built-in template sources', () => {
  it('each format ships a downloadable Mustache source and filename', () => {
    for (const f of EXPORT_FORMATS) {
      expect(f.source.length).toBeGreaterThan(0);
      expect(f.templateFilename.endsWith('.mustache')).toBe(true);
    }
  });

  it('the downloadable KML template re-renders to valid KML', () => {
    const kml = renderUserTemplate(EXPORT_FORMATS[0]!.source, 'kml', model());
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml).toContain('<coordinates>-105,40,1600</coordinates>');
    expect(kml).toContain('#flightPath');
    expect(kml.trimEnd().endsWith('</kml>')).toBe(true);
  });

  it('the downloadable GPX template re-renders a waypoint and track point', () => {
    const gpx = renderUserTemplate(EXPORT_FORMATS[1]!.source, 'gpx', model());
    expect(gpx).toContain('<wpt lat="40" lon="-105">');
    expect(gpx).toContain('<trkpt lat="40" lon="-105"><ele>1600</ele></trkpt>');
  });

  it('the downloadable waypoint-CSV template re-renders the header row', () => {
    const csv = renderUserTemplate(EXPORT_FORMATS[2]!.source, 'csv', model());
    expect(csv.split('\r\n')[0]).toBe(
      '"altitude(m)","latitude","longitude","label","symbol","color","label_color","name"',
    );
  });
});

describe('mimeForExtension', () => {
  it('maps known extensions and falls back to text/plain', () => {
    expect(mimeForExtension('kml')).toContain('google-earth');
    expect(mimeForExtension('gpx')).toContain('gpx');
    expect(mimeForExtension('csv')).toContain('csv');
    expect(mimeForExtension('weird')).toContain('text/plain');
  });
});
