import { DEFAULT_FLYER, flyerFrom, type Flyer } from './flyer';
import { nsKey } from './storageKeys';
import type { PartKey } from '../design/partColors';
import { readFigureStyles, type FigureStyles } from '../design/figureStyle';
import type { CompleteLaunch } from '../flight/requiredLaunch';
import { MAX_ANGLE_STEP_RANGE, seedFromInput, stepperOf } from '../flight/simulations';
import type { SimStepper } from '../../engine/openRocketEngine';
import { DEFAULT_HEADING_DEG } from '../flight/windLevels';
import { defaultCsvFormat, type CsvFormat } from '../flight/flightColumns';
import { usableWindLevels } from '../flight/windLevels';
import { usableAtmosphereLevels } from '../flight/atmosphereLevels';
import {
  METRIC_UNITS,
  UNIT_CHOICES,
  type UnitChoice,
  normalizeUnitOverrides,
  normalizeUnits,
  type UnitOverrides,
  type UnitSelection,
  degToRad,
} from '../../prefs/units';
import { hexOf, parseHexColor } from '../design/colorHex';
import { parseDefaultMaterialKey } from '../design/materialSlots';
import { THEME_PREFS, type NonDaylightPref, type ThemePref } from '../app/theme';

// The minimum keeps the design actions on one row.
export const TREE_PANE_MIN = 300;
export const TREE_PANE_MAX = 640;
export const TREE_PANE_DEFAULT = 360;

/** Right-hand column bounds. Narrower, the 2-up Results tiles wrap badly. */
export const SIDE_PANE_MIN = 300;
export const SIDE_PANE_MAX = 640;
export const SIDE_PANE_DEFAULT = 380;

export const CENTER_PANE_MIN = 320;

const clampPane = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : fallback;

const clampTreePane = (v: unknown): number => clampPane(v, TREE_PANE_MIN, TREE_PANE_MAX, TREE_PANE_DEFAULT);
const clampSidePane = (v: unknown): number => clampPane(v, SIDE_PANE_MIN, SIDE_PANE_MAX, SIDE_PANE_DEFAULT);

const DEFAULT_LAUNCH: CompleteLaunch = {
  launchRodLengthM: 1,
  launchRodAngleDeg: 0,
  launchRodDirectionDeg: DEFAULT_HEADING_DEG,
  launchIntoWind: false,
  windAverage: 0,
  windStdDev: 0,
  windDirectionDeg: DEFAULT_HEADING_DEG,
  launchAltitudeM: 0,
  latitudeDeg: 28.61,
  longitudeDeg: -80.6,
  temperatureC: null,
  pressureHPa: null,
  geodetic: 'spherical',
};

export interface SimulationSettings {
  /** Seconds. */
  timeStep: number;
  /** Seconds. */
  maxTime: number;
  /** Radians. */
  maxAngleStep: number;
  stepper: SimStepper;
  /** Null means a random seed each run. */
  randomSeed: number | null;
  confirmDelete: boolean;
  autoRunOutdated: boolean;
  /** m/s; also replaces the kernel's hard-coded 20 m/s deployment warning. */
  deploymentSpeedWarn: number;
  /** m/s. */
  mainHighSpeedWarn: number;
  mainLowSpeedWarn: number;
  /** m/s; enforced by PATCH(drogue-low-speed) in `BasicEventSimulationEngine`. */
  drogueLowSpeedWarn: number;
  /** m/s. */
  railExitVelocityMin: number;
  /** Changes the flight itself; false matches OpenRocket (full rod length, buttons ignored). */
  guideAwareRodClearance: boolean;
}

interface RulerSides {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export const HEADER_SUMMARY_PREFS = ['full', 'compact', 'off'] as const;
export type HeaderSummaryPref = (typeof HEADER_SUMMARY_PREFS)[number];

export const STATS_LAYOUTS = ['compact', 'standard'] as const;
export type StatsLayout = (typeof STATS_LAYOUTS)[number];

export interface Settings {
  /** Display/entry only: the tree, kernel and saved files stay SI. */
  units: UnitSelection;
  unitOverrides: UnitOverrides;
  partColors: Partial<Record<PartKey, string>>;
  figureStyles: FigureStyles;
  /** Spent at part creation, not resolved at simulation time as desktop does. */
  defaultMaterials: Record<string, { name: string; density: number; group?: string }>;
  phaseColors: { boost: string; coast: string; descent: string };
  aeroHeat: 'sky' | 'openrocket';
  playbackSpeed: number;
  simulation: SimulationSettings;
  launchDefaults: CompleteLaunch;
  headerSummary: HeaderSummaryPref;
  statsLayout: StatsLayout;
  showMarkers: boolean;
  showInfoCard: boolean;
  showStats: boolean;
  showImportNotes: boolean;
  showSafetyCard: boolean;
  /** CSS px. */
  treePaneWidth: number;
  sidePaneWidth: number;
  /** Ignored on Simulations, or the editor would hide with no toolbar to restore it. */
  maximizeCenter: boolean;
  rulers: RulerSides;
  saveDesignInfo: boolean;
  askWhereToSave: boolean;
  theme: ThemePref;
  themeBeforeDaylight: NonDaylightPref;
  report: ReportSettings;
  pathExport: PathExportSettings;
  flightSeries: string[];
  flightCsv: CsvFormat;
  wipAcknowledged: boolean;
  flyer: Flyer;
}

export interface ReportSettings {
  units: UnitChoice;
  /** Hex, or '' for outline only. */
  templateFill: string;
  templateStroke: string;
  paper: 'letter' | 'a4';
  orientation: 'portrait' | 'landscape';
}

/** Stage colors are keyed by stage index, not name (two stages can share a name). */
export interface PathExportSettings {
  labelWaypointsWithMission: boolean;
  waypoints?: string[];
  includeFlightPath?: boolean;
  includeGroundTrack?: boolean;
  pathStride?: number;
  altitudeUnit?: string;
  distanceUnit?: string;
  altitudeReference?: string;
  waypointAltitudeReference?: string;
  drawShadow?: boolean;
  stageTrackStart?: string;
  showWaypointLabels?: boolean;
  colorWaypointPins?: boolean;
  includeDescriptions?: boolean;
  /** '' and absent both follow the app. */
  exportLanguage?: string;
  branchColors?: Record<string, string>;
  branchGroundColors?: Record<string, string>;
  branchPinColors?: Record<string, string>;
}

const DEFAULT_PATH_EXPORT: PathExportSettings = {
  labelWaypointsWithMission: false,
};

export function encodeStageColors(colors: Map<number, number>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [index, rgb] of colors) {
    out[String(index)] = hexOf(rgb, false);
  }
  return out;
}

export function decodeStageColors(value: unknown): Map<number, number> {
  const out = new Map<number, number>();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const index = Number.parseInt(key, 10);
    if (!Number.isInteger(index) || index < 0) continue;
    if (typeof raw !== 'string' || !/^[0-9a-fA-F]{6}$/.test(raw)) continue;
    out.set(index, parseHexColor(raw)!);
  }
  return out;
}

export const DEFAULT_REPORT: ReportSettings = {
  units: 'current',
  templateFill: '',
  templateStroke: '#111827',
  paper: 'letter',
  orientation: 'portrait',
};

export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

export const playbackLabel = (s: number): string => (s === 0.25 ? '¼×' : s === 0.5 ? '½×' : `${s}×`);

const clampPlayback = (v: unknown): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return DEFAULT_SETTINGS.playbackSpeed;
  const gap = (s: number) => Math.abs(Math.log(v / s));
  return PLAYBACK_SPEEDS.reduce((best, s) => (gap(s) < gap(best) ? s : best), PLAYBACK_SPEEDS[0]);
};

/** SI; `maxAngleStep` in radians. A run cannot be interrupted, so `maxTime / timeStep` stays bounded. */
export const SIM_BOUNDS = {
  timeStep: { min: 0.001, max: 10 },
  maxTime: { min: 1, max: 10_000 },
  maxAngleStep: MAX_ANGLE_STEP_RANGE,
} as const;

export const DEFAULT_SETTINGS: Settings = {
  units: METRIC_UNITS,
  unitOverrides: {},
  partColors: {},
  figureStyles: {},
  defaultMaterials: {},
  phaseColors: { boost: '#fb923c', coast: '#38bdf8', descent: '#34d399' },
  aeroHeat: 'sky',
  playbackSpeed: 0.5,
  simulation: {
    timeStep: 0.05,
    maxTime: 1200,
    // The kernel's own RECOMMENDED_ANGLE_STEP (AbstractRKSimulationStepper).
    maxAngleStep: degToRad(3),
    stepper: 'rk4',
    randomSeed: null,
    confirmDelete: true,
    autoRunOutdated: false,
    deploymentSpeedWarn: 20,
    mainHighSpeedWarn: 30.48,
    mainLowSpeedWarn: 15.24,
    drogueLowSpeedWarn: 3.048,
    railExitVelocityMin: 15,
    guideAwareRodClearance: false,
  },
  launchDefaults: DEFAULT_LAUNCH,
  headerSummary: 'full',
  statsLayout: 'compact',
  showMarkers: true,
  showInfoCard: false,
  showStats: true,
  showImportNotes: true,
  showSafetyCard: true,
  treePaneWidth: TREE_PANE_DEFAULT,
  sidePaneWidth: SIDE_PANE_DEFAULT,
  maximizeCenter: false,
  rulers: { top: true, bottom: false, left: true, right: false },
  saveDesignInfo: false,
  askWhereToSave: true,
  theme: 'dark',
  themeBeforeDaylight: 'dark',
  report: DEFAULT_REPORT,
  pathExport: DEFAULT_PATH_EXPORT,
  flightSeries: ['altitude', 'velocity', 'acceleration'],
  flightCsv: defaultCsvFormat(),
  wipAcknowledged: false,
  flyer: DEFAULT_FLYER,
};

const KEY = nsKey('settings:v1');

function loadPathExport(raw: unknown): PathExportSettings {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<PathExportSettings>;
  const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
  const colors = (v: unknown): Record<string, string> | undefined => {
    const m = decodeStageColors(v);
    return m.size ? encodeStageColors(m) : undefined;
  };
  const out: PathExportSettings = {
    labelWaypointsWithMission: bool(p.labelWaypointsWithMission) ?? DEFAULT_PATH_EXPORT.labelWaypointsWithMission,
  };
  if (Array.isArray(p.waypoints)) {
    out.waypoints = p.waypoints.filter((w): w is string => typeof w === 'string');
  }
  const assign = <K extends keyof PathExportSettings>(k: K, v: PathExportSettings[K]) => {
    if (v !== undefined) out[k] = v;
  };
  assign('includeFlightPath', bool(p.includeFlightPath));
  assign('includeGroundTrack', bool(p.includeGroundTrack));
  if (typeof p.pathStride === 'number' && Number.isInteger(p.pathStride) && p.pathStride >= 1) {
    out.pathStride = p.pathStride;
  }
  assign('altitudeUnit', str(p.altitudeUnit));
  assign('distanceUnit', str(p.distanceUnit));
  assign('altitudeReference', str(p.altitudeReference));
  assign('waypointAltitudeReference', str(p.waypointAltitudeReference));
  assign('drawShadow', bool(p.drawShadow));
  assign('stageTrackStart', str(p.stageTrackStart));
  assign('showWaypointLabels', bool(p.showWaypointLabels));
  assign('colorWaypointPins', bool(p.colorWaypointPins));
  assign('includeDescriptions', bool(p.includeDescriptions));
  // Not `str()`, which drops '', the "follow the app" choice.
  if (typeof p.exportLanguage === 'string') out.exportLanguage = p.exportLanguage;
  assign('branchColors', colors(p.branchColors));
  assign('branchGroundColors', colors(p.branchGroundColors));
  assign('branchPinColors', colors(p.branchPinColors));
  return out;
}

const isHexColor = (v: unknown): v is string =>
  typeof v === 'string' && v.startsWith('#') && v.trim() === v && parseHexColor(v) !== null;

/** A fresh copy, never the constant: a caller patching a nested block would rewrite the defaults. */
export const defaultSettings = (): Settings => structuredClone(DEFAULT_SETTINGS);

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings();
    return settingsFrom(JSON.parse(raw));
  } catch {
    return defaultSettings();
  }
}

export function settingsFrom(value: unknown): Settings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return structuredClone(DEFAULT_SETTINGS);
  const s = value as Partial<Settings>;
  const savedRulers =
    s.rulers && typeof s.rulers === 'object'
      ? (Object.fromEntries(
          (['top', 'bottom', 'left', 'right'] as const)
            .filter((k) => typeof s.rulers![k] === 'boolean')
            .map((k) => [k, s.rulers![k]]),
        ) as Partial<RulerSides>)
      : {};
  return {
    units: normalizeUnits(s.units),
    unitOverrides: normalizeUnitOverrides(s.unitOverrides),
    // Filtered, not spread: these reach a style attribute, so no CSS payload rides through.
    partColors: Object.fromEntries(
      Object.entries((s.partColors ?? {}) as Record<string, unknown>).filter(([, v]) => isHexColor(v)),
    ),
    figureStyles: readFigureStyles(s.figureStyles),
    defaultMaterials: Object.fromEntries(
      Object.entries((s.defaultMaterials ?? {}) as Record<string, unknown>).flatMap(([key, v]) => {
        if (!parseDefaultMaterialKey(key)) return [];
        const m = v as { name?: unknown; density?: unknown; group?: unknown } | null;
        if (
          !m ||
          typeof m.name !== 'string' ||
          m.name.trim() === '' ||
          typeof m.density !== 'number' ||
          !Number.isFinite(m.density) ||
          !(m.density > 0)
        )
          return [];
        const group = typeof m.group === 'string' && m.group.trim() !== '' ? { group: m.group } : {};
        return [[key, { name: m.name, density: m.density, ...group }]];
      }),
    ),
    // Same filter as partColors: these reach a style attribute too.
    phaseColors: (() => {
      const c = { ...DEFAULT_SETTINGS.phaseColors };
      for (const k of ['boost', 'coast', 'descent'] as const) {
        const v = (s.phaseColors as Record<string, unknown> | undefined)?.[k];
        if (isHexColor(v)) c[k] = v;
      }
      return c;
    })(),
    aeroHeat: s.aeroHeat === 'openrocket' ? 'openrocket' : DEFAULT_SETTINGS.aeroHeat,
    headerSummary: HEADER_SUMMARY_PREFS.includes(s.headerSummary as HeaderSummaryPref)
      ? (s.headerSummary as HeaderSummaryPref)
      : DEFAULT_SETTINGS.headerSummary,
    statsLayout: STATS_LAYOUTS.includes(s.statsLayout as StatsLayout)
      ? (s.statsLayout as StatsLayout)
      : DEFAULT_SETTINGS.statsLayout,
    playbackSpeed: clampPlayback(s.playbackSpeed),
    simulation: (() => {
      const sim = { ...DEFAULT_SETTINGS.simulation, ...(s.simulation ?? {}) };
      const pos = (v: number, d: number) => (Number.isFinite(v) && v > 0 ? v : d);
      sim.timeStep = pos(sim.timeStep, DEFAULT_SETTINGS.simulation.timeStep);
      sim.maxTime = pos(sim.maxTime, DEFAULT_SETTINGS.simulation.maxTime);
      sim.maxAngleStep = pos(sim.maxAngleStep, DEFAULT_SETTINGS.simulation.maxAngleStep);
      for (const k of ['timeStep', 'maxTime', 'maxAngleStep'] as const) {
        sim[k] = Math.min(SIM_BOUNDS[k].max, Math.max(SIM_BOUNDS[k].min, sim[k]));
      }
      sim.deploymentSpeedWarn = pos(sim.deploymentSpeedWarn, DEFAULT_SETTINGS.simulation.deploymentSpeedWarn);
      sim.mainHighSpeedWarn = pos(sim.mainHighSpeedWarn, DEFAULT_SETTINGS.simulation.mainHighSpeedWarn);
      sim.mainLowSpeedWarn = pos(sim.mainLowSpeedWarn, DEFAULT_SETTINGS.simulation.mainLowSpeedWarn);
      sim.drogueLowSpeedWarn = pos(sim.drogueLowSpeedWarn, DEFAULT_SETTINGS.simulation.drogueLowSpeedWarn);
      sim.railExitVelocityMin = pos(sim.railExitVelocityMin, DEFAULT_SETTINGS.simulation.railExitVelocityMin);
      // The bridge fails the whole run on a wrong type here.
      sim.guideAwareRodClearance = sim.guideAwareRodClearance === true;
      sim.stepper = stepperOf(sim.stepper, DEFAULT_SETTINGS.simulation.stepper);
      const seed: unknown = sim.randomSeed;
      sim.randomSeed = typeof seed === 'number' && Number.isFinite(seed) ? seedFromInput(seed) : null;
      const flag = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
      sim.confirmDelete = flag(sim.confirmDelete, DEFAULT_SETTINGS.simulation.confirmDelete);
      sim.autoRunOutdated = flag(sim.autoRunOutdated, DEFAULT_SETTINGS.simulation.autoRunOutdated);
      return sim;
    })(),
    launchDefaults: (() => {
      // Null `temperatureC`/`pressureHPa` is valid: it means ISA.
      const l = { ...DEFAULT_SETTINGS.launchDefaults, ...(s.launchDefaults ?? {}) };
      for (const k of [
        'launchRodLengthM',
        'launchRodAngleDeg',
        'windAverage',
        'windStdDev',
        'launchAltitudeM',
        'latitudeDeg',
        'longitudeDeg',
      ] as const) {
        if (!Number.isFinite(l[k])) l[k] = DEFAULT_SETTINGS.launchDefaults[k];
      }
      for (const k of ['launchRodDirectionDeg', 'windDirectionDeg'] as const) {
        if (l[k] !== undefined && !Number.isFinite(l[k])) l[k] = DEFAULT_SETTINGS.launchDefaults[k];
      }
      for (const k of ['temperatureC', 'pressureHPa'] as const) {
        const v = l[k];
        if (v !== null && !Number.isFinite(v)) l[k] = DEFAULT_SETTINGS.launchDefaults[k];
      }
      if (typeof l.launchIntoWind !== 'boolean' && l.launchIntoWind !== undefined) {
        l.launchIntoWind = DEFAULT_SETTINGS.launchDefaults.launchIntoWind;
      }
      if (l.geodetic !== undefined && !['flat', 'spherical', 'wgs84'].includes(l.geodetic)) {
        l.geodetic = DEFAULT_SETTINGS.launchDefaults.geodetic;
      }
      // JsonLite's typed getters throw on the wrong type; absent means the kernel default.
      if (l.gravityModel !== undefined && !['wgs', 'constant'].includes(l.gravityModel)) delete l.gravityModel;
      if (l.constantGravity !== undefined && !(Number.isFinite(l.constantGravity) && l.constantGravity > 0)) {
        delete l.constantGravity;
      }
      const humidity = l.relativeHumidity;
      if (
        humidity !== undefined &&
        humidity !== null &&
        !(Number.isFinite(humidity) && humidity >= 0 && humidity <= 1)
      ) {
        delete l.relativeHumidity;
      }
      if (l.windAltitudeReference !== undefined && !['msl', 'agl'].includes(l.windAltitudeReference)) {
        delete l.windAltitudeReference;
      }
      if (l.windLevels !== undefined) {
        l.windLevels = Array.isArray(l.windLevels)
          ? usableWindLevels(l.windLevels)
          : DEFAULT_SETTINGS.launchDefaults.windLevels;
      }
      if (l.keptWindLevels !== undefined) {
        const kept = Array.isArray(l.keptWindLevels) ? usableWindLevels(l.keptWindLevels) : [];
        if (kept.length) l.keptWindLevels = kept;
        else delete l.keptWindLevels;
      }
      if (l.atmosphereLevels !== undefined) {
        const kept = Array.isArray(l.atmosphereLevels) ? usableAtmosphereLevels(l.atmosphereLevels) : [];
        if (kept.length) l.atmosphereLevels = kept;
        else delete l.atmosphereLevels;
      }
      delete l.weatherSource;
      return l;
    })(),
    showMarkers: typeof s.showMarkers === 'boolean' ? s.showMarkers : DEFAULT_SETTINGS.showMarkers,
    showInfoCard: typeof s.showInfoCard === 'boolean' ? s.showInfoCard : DEFAULT_SETTINGS.showInfoCard,
    showStats: typeof s.showStats === 'boolean' ? s.showStats : DEFAULT_SETTINGS.showStats,
    showImportNotes: typeof s.showImportNotes === 'boolean' ? s.showImportNotes : DEFAULT_SETTINGS.showImportNotes,
    showSafetyCard: typeof s.showSafetyCard === 'boolean' ? s.showSafetyCard : DEFAULT_SETTINGS.showSafetyCard,
    treePaneWidth: clampTreePane(s.treePaneWidth),
    sidePaneWidth: clampSidePane(s.sidePaneWidth),
    maximizeCenter: typeof s.maximizeCenter === 'boolean' ? s.maximizeCenter : DEFAULT_SETTINGS.maximizeCenter,
    rulers: { ...DEFAULT_SETTINGS.rulers, ...savedRulers },
    saveDesignInfo: typeof s.saveDesignInfo === 'boolean' ? s.saveDesignInfo : DEFAULT_SETTINGS.saveDesignInfo,
    askWhereToSave: typeof s.askWhereToSave === 'boolean' ? s.askWhereToSave : DEFAULT_SETTINGS.askWhereToSave,
    theme: THEME_PREFS.includes(s.theme as ThemePref) ? (s.theme as ThemePref) : DEFAULT_SETTINGS.theme,
    themeBeforeDaylight:
      (s.themeBeforeDaylight as string) !== 'daylight' && THEME_PREFS.includes(s.themeBeforeDaylight as ThemePref)
        ? (s.themeBeforeDaylight as NonDaylightPref)
        : DEFAULT_SETTINGS.themeBeforeDaylight,
    report: (() => {
      const r = { ...DEFAULT_REPORT, ...(s.report ?? {}) };
      if (!UNIT_CHOICES.includes(r.units)) r.units = DEFAULT_REPORT.units;
      // jsPDF throws on an unknown page format or orientation.
      if (r.paper !== 'letter' && r.paper !== 'a4') r.paper = DEFAULT_REPORT.paper;
      if (r.orientation !== 'portrait' && r.orientation !== 'landscape') r.orientation = DEFAULT_REPORT.orientation;
      return r;
    })(),
    pathExport: loadPathExport(s.pathExport),
    flightSeries: Array.isArray(s.flightSeries)
      ? s.flightSeries.filter((x): x is string => typeof x === 'string')
      : DEFAULT_SETTINGS.flightSeries,
    flightCsv: (() => {
      const c = { ...DEFAULT_SETTINGS.flightCsv, ...(s.flightCsv ?? {}) };
      c.columns = Array.isArray(c.columns)
        ? c.columns.filter((x): x is string => typeof x === 'string')
        : DEFAULT_SETTINGS.flightCsv.columns;
      // `toFixed` throws outside 0..100.
      c.decimals = Number.isFinite(c.decimals) ? Math.min(Math.max(Math.round(c.decimals), 0), 12) : 3;
      if (typeof c.separator !== 'string' || !c.separator) c.separator = ',';
      // A stored two-character backslash-t names the tab character.
      if (c.separator === '\\t') c.separator = '\t';
      if (typeof c.commentChar !== 'string' || !c.commentChar) c.commentChar = '#';
      // A stored "false" string is truthy in the writer's branches.
      for (const k of ['exponential', 'simDescription', 'fieldDescriptions', 'flightEvents'] as const) {
        if (typeof c[k] !== 'boolean') c[k] = DEFAULT_SETTINGS.flightCsv[k];
      }
      return c;
    })(),
    wipAcknowledged: typeof s.wipAcknowledged === 'boolean' ? s.wipAcknowledged : DEFAULT_SETTINGS.wipAcknowledged,
    flyer: flyerFrom(s.flyer),
  };
}

/** Null, not defaults, when nothing is stored: the caller's copy is then the best record. */
export function loadStoredSettings(): Settings | null {
  try {
    if (!localStorage.getItem(KEY)) return null;
  } catch {
    return null;
  }
  return loadSettings();
}

/** Keys a newer build wrote; a change writes them back so they survive. */
export function unknownStoredSettings(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(KEY);
    const stored = raw ? (JSON.parse(raw) as unknown) : null;
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter(([k]) => !Object.hasOwn(DEFAULT_SETTINGS, k)));
  } catch {
    return {};
  }
}

/** A null key is a clear of the whole store. */
export function isSettingsStorageKey(key: string | null): boolean {
  return key === null || key === KEY;
}

export function saveSettings(s: Settings): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
