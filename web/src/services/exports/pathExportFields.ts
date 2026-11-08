import {
  asAltitudeReference,
  asDistanceUnit,
  asStageTrackStart,
  asWaypointKinds,
  type FlightPathExportOptions,
} from './flightPathExport';
import { decodeStageColors, encodeStageColors, type PathExportSettings } from '../storage/settings';

// The mission name has no row on purpose: a stale value mislabels the next file.

export type UnitField = 'altitude' | 'distance';

interface Field<O extends keyof FlightPathExportOptions, S extends keyof PathExportSettings> {
  option: O;
  setting: S;
  load: (stored: PathExportSettings[S], fallback: FlightPathExportOptions[O]) => FlightPathExportOptions[O];
  save: (value: FlightPathExportOptions[O]) => PathExportSettings[S];
  unit?: UnitField;
}

interface AnyField {
  option: keyof FlightPathExportOptions;
  setting: keyof PathExportSettings;
  load: (stored: unknown, fallback: unknown) => unknown;
  save: (value: unknown) => unknown;
  unit?: UnitField;
}

const field = <O extends keyof FlightPathExportOptions, S extends keyof PathExportSettings>(f: Field<O, S>): AnyField =>
  f as unknown as AnyField;

type Shared = keyof FlightPathExportOptions & keyof PathExportSettings;

type PlainKey = { [K in Shared]: FlightPathExportOptions[K] extends PathExportSettings[K] ? K : never }[Shared];

const plain = <K extends PlainKey>(key: K): AnyField =>
  field({
    option: key,
    setting: key,
    load: (stored, fallback) => (stored ?? fallback) as FlightPathExportOptions[K],
    // PlainKey guarantees the types match; the compiler cannot see that through K.
    save: (value) => value as unknown as PathExportSettings[K],
  });

// Rows follow the stored object's key order.
export const PATH_EXPORT_FIELDS: readonly AnyField[] = [
  field({
    option: 'labelWaypointsWithMission',
    setting: 'labelWaypointsWithMission',
    load: (stored) => stored,
    save: (value) => value,
  }),
  field({
    option: 'waypoints',
    setting: 'waypoints',
    // A saved empty selection is a real choice; only a missing or unreadable list falls back.
    load: (stored, fallback) => asWaypointKinds(stored) ?? fallback,
    save: (value) => [...value],
  }),
  plain('includeFlightPath'),
  plain('includeGroundTrack'),
  plain('pathStride'),
  field({
    option: 'altitudeUnit',
    setting: 'altitudeUnit',
    load: (stored, fallback) => asDistanceUnit(stored) ?? fallback,
    save: (value) => value,
    unit: 'altitude',
  }),
  field({
    option: 'distanceUnit',
    setting: 'distanceUnit',
    load: (stored, fallback) => asDistanceUnit(stored) ?? fallback,
    save: (value) => value,
    unit: 'distance',
  }),
  field({
    option: 'altitudeReference',
    setting: 'altitudeReference',
    load: (stored, fallback) => asAltitudeReference(stored) ?? fallback,
    save: (value) => value,
  }),
  field({
    option: 'waypointAltitudeReference',
    setting: 'waypointAltitudeReference',
    load: (stored, fallback) => asAltitudeReference(stored) ?? fallback,
    save: (value) => value,
  }),
  plain('drawShadow'),
  field({
    option: 'stageTrackStart',
    setting: 'stageTrackStart',
    load: (stored, fallback) => asStageTrackStart(stored) ?? fallback,
    save: (value) => value,
  }),
  plain('showWaypointLabels'),
  plain('colorWaypointPins'),
  plain('includeDescriptions'),
  field({
    option: 'language',
    setting: 'exportLanguage',
    // '' is a real choice ("follow the app").
    load: (stored, fallback) => stored ?? fallback,
    save: (value) => value,
  }),
  field({
    option: 'branchColors',
    setting: 'branchColors',
    load: (stored) => decodeStageColors(stored),
    save: (value) => encodeStageColors(value),
  }),
  field({
    option: 'branchGroundColors',
    setting: 'branchGroundColors',
    load: (stored) => decodeStageColors(stored),
    save: (value) => encodeStageColors(value),
  }),
  field({
    option: 'branchPinColors',
    setting: 'branchPinColors',
    load: (stored) => decodeStageColors(stored),
    save: (value) => encodeStageColors(value),
  }),
];

export function hydrateExportOptions(
  base: FlightPathExportOptions,
  stored: PathExportSettings,
): FlightPathExportOptions {
  const out = { ...base } as unknown as Record<string, unknown>;
  for (const f of PATH_EXPORT_FIELDS) out[f.option] = f.load(stored[f.setting], base[f.option]);
  return out as unknown as FlightPathExportOptions;
}

export function persistedExportSettings(
  next: FlightPathExportOptions,
  explicit: Record<UnitField, boolean>,
): PathExportSettings {
  const out: Record<string, unknown> = {};
  for (const f of PATH_EXPORT_FIELDS) {
    if (f.unit && !explicit[f.unit]) continue;
    out[f.setting] = f.save(next[f.option]);
  }
  return out as unknown as PathExportSettings;
}
