import i18n from '../../i18n';
import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';

let counter = 1;

export function freshId(): string {
  return `c${counter++}`;
}

export function asStageNodes(tree: RocketTree): ComponentNode[] {
  return tree.components.every((c) => c.type === 'stage')
    ? tree.components
    : [{ type: 'stage', name: defaultStageName(0), children: tree.components }];
}

/** File text in the UI language, as desktop writes `BasicFrame.StageName.Sustainer`; not a display label. */
export const defaultStageName = (i: number): string =>
  i === 0 ? i18n.t('stageName.sustainer') : i18n.t('stageName.booster', { n: i });

export const stageFileName = (st: ComponentNode, i: number): string =>
  typeof st.name === 'string' ? st.name : defaultStageName(i);

export interface WindLevel {
  /** MSL. */
  altitudeM: number;
  /** m/s. */
  speed: number;
  directionDeg: number;
  /** m/s. */
  stddev: number;
}

export interface AtmosphereLevel {
  /** MSL. */
  altitudeM: number;
  temperatureC: number;
  pressureHPa: number;
  /** Fraction (0..1). */
  relativeHumidity: number;
}

export type LaunchPatch =
  Partial<LaunchConditions> | ((launch: LaunchConditions, rowId: string) => Partial<LaunchConditions>);

export const launchPatchFor = (p: LaunchPatch, launch: LaunchConditions, rowId: string): Partial<LaunchConditions> =>
  typeof p === 'function' ? p(launch, rowId) : p;

/** Wind profiles and atmosphere come from `launch` alone; the defaults' would turn an Average flight multilevel. */
export const overLaunchDefaults = (
  defaults: LaunchConditions,
  launch: Partial<LaunchConditions> | undefined,
): LaunchConditions => {
  const out = { ...defaults, ...launch };
  if (!launch) return out;
  if (launch.windLevels === undefined) delete out.windLevels;
  if (launch.keptWindLevels === undefined) delete out.keptWindLevels;
  if (launch.atmosphereLevels === undefined) delete out.atmosphereLevels;
  return out;
};

export interface LaunchConditions {
  launchRodLengthM: number | null;
  launchRodAngleDeg: number | null;
  launchRodDirectionDeg?: number;
  launchIntoWind?: boolean;
  windAverage: number | null;
  windStdDev: number | null;
  windDirectionDeg?: number;
  windLevels?: WindLevel[];
  /** Never flown (`simConditions` and `resultKey` ignore it); absent while `windLevels` is set. */
  keptWindLevels?: WindLevel[];
  windAltitudeReference?: 'msl' | 'agl';
  launchAltitudeM: number | null;
  latitudeDeg: number | null;
  /** Null, not undefined, when cleared: `JSON.stringify` drops undefined and the workspace merge restores the default. */
  longitudeDeg: number | null;
  geodetic?: 'flat' | 'spherical' | 'wgs84';
  gravityModel?: 'wgs' | 'constant';
  /** m/s^2. */
  constantGravity?: number;
  /** null for the ISA standard atmosphere. */
  temperatureC: number | null;
  /** null for the ISA standard atmosphere. */
  pressureHPa: number | null;
  /** Fraction (0..1), or null for the ISA standard. */
  relativeHumidity?: number | null;
  atmosphereLevels?: AtmosphereLevel[];
  /** Must stay out of `resultKey`, so a refresh that changes no value leaves results current. */
  weatherSource?: WeatherSource;
}

export interface WeatherSource {
  provider: 'open-meteo';
  endpoint: 'forecast' | 'archive';
  /** Site-calendar date, in `timezone`. */
  date: string;
  hour: number;
  timezone: string;
  latitudeDeg: number;
  longitudeDeg: number;
  elevationM: number;
  validAt: string;
  fetchedAt: string;
  groups: ('temperature' | 'pressure' | 'humidity' | 'wind' | 'atmosphere')[];
  elevationApplied: boolean;
  /** Absent when read from a file, which records `edited` instead. */
  applied?: Partial<LaunchConditions>;
  edited?: true;
}
