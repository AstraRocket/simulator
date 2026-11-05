import { WAYPOINT_KINDS, type FlightPathExportOptions, type WaypointKind } from './flightPathExport';

// Each preset states its full selection, so every preset stays reachable from every other.
export const EXPORT_PRESETS: {
  id: string;
  options: Partial<FlightPathExportOptions> & { waypoints: Set<WaypointKind> };
}[] = [
  {
    id: 'driftCast',
    options: {
      waypoints: new Set<WaypointKind>(WAYPOINT_KINDS),
      altitudeReference: 'clamped',
      waypointAltitudeReference: 'clamped',
      includeFlightPath: false,
      includeGroundTrack: true,
      drawShadow: false,
    },
  },
  {
    // Must equal `defaultExportOptions`, so a fresh dialog opens on this preset.
    id: 'flightPath',
    options: {
      waypoints: new Set<WaypointKind>(WAYPOINT_KINDS),
      altitudeReference: 'automatic',
      waypointAltitudeReference: 'automatic',
      includeFlightPath: true,
      includeGroundTrack: true,
      drawShadow: false,
    },
  },
  {
    id: 'landing',
    options: {
      waypoints: new Set<WaypointKind>(['landing']),
      altitudeReference: 'clamped',
      waypointAltitudeReference: 'clamped',
      includeFlightPath: false,
      includeGroundTrack: false,
      drawShadow: false,
    },
  },
];

export function matchingPreset(opts: FlightPathExportOptions): string | null {
  const same = (a: unknown, b: unknown): boolean => {
    if (a instanceof Set) {
      const other = b as Set<unknown>;
      return other instanceof Set && other.size === a.size && [...a].every((v) => other.has(v));
    }
    return a === b;
  };
  const current = opts as unknown as Record<string, unknown>;
  const match = EXPORT_PRESETS.find((preset) =>
    Object.entries(preset.options).every(([key, value]) => same(value, current[key])),
  );
  return match?.id ?? null;
}
