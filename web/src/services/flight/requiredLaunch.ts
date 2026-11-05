import type { LaunchConditions } from '../design/orkTree';

// Cleared values stay null, never `v ?? 0`: most of these are legitimately zero.
export const REQUIRED_LAUNCH_KEYS = [
  'launchRodLengthM',
  'launchRodAngleDeg',
  'windAverage',
  'windStdDev',
  'launchAltitudeM',
  'latitudeDeg',
  'longitudeDeg',
] as const satisfies readonly (keyof LaunchConditions)[];

export type RequiredLaunchKey = (typeof REQUIRED_LAUNCH_KEYS)[number];

export type CompleteLaunch = LaunchConditions & { [K in RequiredLaunchKey]: number };

export const isFilled = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

const SINGLE_WIND_KEYS: ReadonlySet<RequiredLaunchKey> = new Set(['windAverage', 'windStdDev']);

// A multilevel profile never reads the single wind (`SimulationOptions.getWindModel`).
export function missingRequired(launch: LaunchConditions): RequiredLaunchKey[] {
  const multilevel = (launch.windLevels?.length ?? 0) > 0;
  return REQUIRED_LAUNCH_KEYS.filter((k) => !(multilevel && SINGLE_WIND_KEYS.has(k)) && !isFilled(launch[k]));
}

export function isComplete(launch: LaunchConditions): launch is CompleteLaunch {
  return missingRequired(launch).length === 0;
}

export function withRequiredFrom(launch: LaunchConditions, fallback: CompleteLaunch): CompleteLaunch {
  const out = { ...launch } as CompleteLaunch;
  for (const k of REQUIRED_LAUNCH_KEYS) if (!isFilled(launch[k])) out[k] = fallback[k];
  return out;
}
