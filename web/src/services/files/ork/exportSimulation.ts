// cspell:ignore randomseed simulationsteppermethod recoveryspeedwarning droguelowspeedwarning Lowspeedwarning recoverydroguemainhighspeedwarning recoverydroguemainlowspeedwarning -- OpenRocket .ork element names
import type { AtmosphereLevel, LaunchConditions } from '../../design/orkTree';
import { escapeXml } from '../xmlUtil';
import { isWeatherSource, sourceStatus } from '../../weather/weatherSource';
import { turbulenceIntensity } from '../../flight/windTurbulence';
import type { OrkWriter } from './exportWriter';
import type { FlightSummary } from '../../../engine/openRocketEngine';
import type { OrkExportSimulation, OrkSimPrefs } from '../orkTypes';
import { unwrapConditionsChild } from './passthrough';
import { degToRad } from '../../../prefs/units';
import { LAUNCH_SI } from '../../../prefs/launchUnits';
import { DEFAULT_HEADING_DEG } from '../../flight/windLevels';
import { G0 } from '../../motors/motorMath';
import { DEFAULT_SETTINGS } from '../../storage/settings';
import { KERNEL_LAUNCH_SITE } from '../../../tree/kernelDefaults';
import { FLIGHT_DATA_ATTRS, SIM_PREF_TAGS } from './simulationTags';

export function simulationsXml(
  w: OrkWriter,
  depth: number,
  launch: LaunchConditions | undefined,
  simulations?: readonly OrkExportSimulation[],
  prefs: OrkSimPrefs = DESKTOP_SIM_PREFS,
): void {
  const { emit } = w;
  emit(depth, '<simulations>');
  if (simulations?.length) {
    for (const sim of simulations) simulationXml(w, depth + 1, sim, prefs);
  } else if (launch) {
    // `SingleSimulationHandler` warns on any other simulator, calculator or status value.
    emit(depth + 1, '<simulation status="notsimulated">');
    emit(depth + 2, '<name>Simulation 1</name>');
    emit(depth + 2, '<simulator>RK4Simulator</simulator>');
    emit(depth + 2, '<calculator>BarrowmanCalculator</calculator>');
    emit(depth + 2, '<conditions>');
    conditionsXml(w, depth + 3, launch, prefs, []);
    emit(depth + 2, '</conditions>');
    emit(depth + 1, '</simulation>');
  }
  emit(depth, '</simulations>');
}

function simulationXml(w: OrkWriter, depth: number, sim: OrkExportSimulation, prefs: OrkSimPrefs): void {
  const { emit } = w;
  const carriedConditions: string[] = [];
  const carried: string[] = [];
  for (const raw of sim.xmlExtra ?? []) {
    const child = unwrapConditionsChild(raw);
    if (child === null) carried.push(raw);
    else carriedConditions.push(child);
  }
  const summary = sim.status === 'notsimulated' ? undefined : sim.summary;
  emit(depth, `<simulation status="${summary ? sim.status : 'notsimulated'}">`);
  emit(depth + 1, `<name>${escapeXml(sim.name)}</name>`);
  emit(depth + 1, '<simulator>RK4Simulator</simulator>');
  emit(depth + 1, '<calculator>BarrowmanCalculator</calculator>');
  emit(depth + 1, '<conditions>');
  const configId = w.writeConfigs.some((c) => c.id === sim.configId) ? sim.configId : w.defaultId;
  conditionsXml(w, depth + 2, sim.launch, sim.prefs ?? prefs, carriedConditions, configId);
  emit(depth + 1, '</conditions>');
  for (const raw of carried) emit(depth + 1, raw);
  if (summary) emit(depth + 1, flightDataTag(summary));
  emit(depth, '</simulation>');
}

function flightDataTag(s: FlightSummary): string {
  const written = FLIGHT_DATA_ATTRS.map(([key, attr]) => [attr, s[key]] as const)
    .filter(([, v]) => v != null && Number.isFinite(v))
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');
  return `<flightdata${written}/>`;
}

const DESKTOP_SIM_PREFS: OrkSimPrefs = DEFAULT_SETTINGS.simulation;

function conditionsXml(
  w: OrkWriter,
  depth: number,
  launch: LaunchConditions,
  prefs: OrkSimPrefs,
  carried: readonly string[],
  configId: string = w.defaultId,
): void {
  const { emit } = w;
  emit(depth, `<configid>${escapeXml(configId)}</configid>`);
  emit(depth, `<launchrodlength>${launch.launchRodLengthM ?? 0}</launchrodlength>`);
  // Rod heading in degrees, wind heading in radians (OpenRocketSaver).
  emit(depth, `<launchintowind>${launch.launchIntoWind === true}</launchintowind>`);
  emit(depth, `<launchrodangle>${launch.launchRodAngleDeg ?? 0}</launchrodangle>`);
  emit(depth, `<launchroddirection>${launch.launchRodDirectionDeg ?? DEFAULT_HEADING_DEG}</launchroddirection>`);
  windXml(w, depth, launch);
  emit(depth, `<launchaltitude>${launch.launchAltitudeM ?? 0}</launchaltitude>`);
  // A cleared coordinate is the default site's, as a run of it flies (not 0, a point off Ecuador).
  emit(depth, `<launchlatitude>${launch.latitudeDeg ?? KERNEL_LAUNCH_SITE.latitudeDeg}</launchlatitude>`);
  emit(depth, `<launchlongitude>${launch.longitudeDeg ?? KERNEL_LAUNCH_SITE.longitudeDeg}</launchlongitude>`);
  emit(depth, `<geodeticmethod>${launch.geodetic ?? 'spherical'}</geodeticmethod>`);
  emit(depth, `<simulationsteppermethod>${prefs.stepper}</simulationsteppermethod>`);
  const seed = prefs.randomSeed;
  const fixedSeed = seed != null && Number.isInteger(seed);
  if (fixedSeed) emit(depth, `<randomseed>${seed}</randomseed>`);
  atmosphereXml(w, depth, launch);
  forecastLevelsXml(w, depth, launch.atmosphereLevels ?? []);
  // As `OpenRocketSaver` writes it; `GravityHandler` reads no other form.
  if (launch.gravityModel === 'constant') {
    emit(depth, '<gravity model="constant">');
    emit(depth + 1, `<value>${launch.constantGravity ?? G0}</value>`);
    emit(depth, '</gravity>');
  }
  weatherSourceXml(w, depth, launch);
  for (const [key, tag] of SIM_PREF_TAGS) emit(depth, `<${tag}>${prefs[key]}</${tag}>`);
  for (const raw of carried) {
    if (fixedSeed && /^<randomseed[\s>/]/i.test(raw)) continue;
    emit(depth, raw);
  }
}

function windXml(w: OrkWriter, depth: number, launch: LaunchConditions): void {
  const { emit } = w;
  const windDirRad = degToRad(launch.windDirectionDeg ?? DEFAULT_HEADING_DEG);
  // Legacy trio: turbulence is the stddev/average ratio, zero wind as PinkNoiseWindModel does.
  const turb = turbulenceIntensity(launch.windAverage ?? 0, launch.windStdDev ?? 0);
  emit(depth, `<windaverage>${launch.windAverage ?? 0}</windaverage>`);
  emit(depth, `<windturbulence>${turb}</windturbulence>`);
  emit(depth, `<winddirection>${windDirRad}</winddirection>`);
  emit(depth, '<wind model="average">');
  emit(depth + 1, `<speed>${launch.windAverage ?? 0}</speed>`);
  emit(depth + 1, `<direction>${windDirRad}</direction>`);
  emit(depth + 1, `<standarddeviation>${launch.windStdDev ?? 0}</standarddeviation>`);
  emit(depth, '</wind>');
  const flown = launch.windLevels ?? [];
  const levels = flown.length ? flown : (launch.keptWindLevels ?? []);
  if (levels.length) {
    // Lower case: findEnum reads "MSL" as no reference and flies AGL.
    emit(depth, `<wind model="multilevel" altituderef="${launch.windAltitudeReference ?? 'msl'}">`);
    for (const l of levels) {
      // Direction in radians.
      emit(
        depth + 1,
        `<windlevel altitude="${l.altitudeM}" speed="${l.speed}" direction="${degToRad(l.directionDeg)}" standarddeviation="${l.stddev}"/>`,
      );
    }
    emit(depth, '</wind>');
  }
  emit(depth, `<windmodeltype>${flown.length ? 'Multilevel' : 'Average'}</windmodeltype>`);
}

function atmosphereXml(w: OrkWriter, depth: number, launch: LaunchConditions): void {
  const { emit } = w;
  if (launch.temperatureC === null && launch.pressureHPa === null && launch.relativeHumidity == null) {
    emit(depth, '<atmosphere model="isa"/>');
  } else {
    // Kelvin / pascal.
    emit(depth, '<atmosphere model="extendedisa">');
    emit(depth + 1, `<basetemperature>${LAUNCH_SI.degC.toSi(launch.temperatureC ?? 15)}</basetemperature>`);
    emit(depth + 1, `<basepressure>${LAUNCH_SI.hPa.toSi(launch.pressureHPa ?? 1013.25)}</basepressure>`);
    if (launch.relativeHumidity != null) {
      emit(depth + 1, `<baserelativehumidity>${launch.relativeHumidity}</baserelativehumidity>`);
    }
    emit(depth, '</atmosphere>');
  }
}

function weatherSourceXml(w: OrkWriter, depth: number, launch: LaunchConditions): void {
  const s = launch.weatherSource;
  if (!isWeatherSource(s)) return;
  const edited = sourceStatus(launch, Date.now())?.edited === true;
  const attr = (k: string, v: string | number | boolean) => `${k}="${escapeXml(String(v))}"`;
  w.emit(
    depth,
    `<weathersource ${[
      attr('provider', s.provider),
      attr('endpoint', s.endpoint),
      attr('date', s.date),
      attr('hour', s.hour),
      attr('timezone', s.timezone),
      attr('latitude', s.latitudeDeg),
      attr('longitude', s.longitudeDeg),
      attr('elevation', s.elevationM),
      attr('valid', s.validAt),
      attr('fetched', s.fetchedAt),
      attr('groups', s.groups.join(' ')),
      attr('elevationapplied', s.elevationApplied),
      attr('edited', edited),
    ].join(' ')}/>`,
  );
}

/** Directly in <conditions>: inside <atmosphere> desktop would warn. Kelvin and pascal. */
function forecastLevelsXml(w: OrkWriter, depth: number, levels: readonly AtmosphereLevel[]): void {
  for (const l of levels) {
    w.emit(
      depth,
      `<forecastlevel altitude="${l.altitudeM}" temperature="${LAUNCH_SI.degC.toSi(l.temperatureC)}" pressure="${LAUNCH_SI.hPa.toSi(l.pressureHPa)}" relativehumidity="${l.relativeHumidity}"/>`,
    );
  }
}
