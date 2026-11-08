import type { LaunchConditions } from '../../design/orkTree';
import { xmlText as text } from '../xmlUtil';
import { stdDevForIntensity } from '../../flight/windTurbulence';
import { usableWindLevels } from '../../flight/windLevels';
import { usableAtmosphereLevels } from '../../flight/atmosphereLevels';
import { isWeatherSource, restoredSource } from '../../weather/weatherSource';
import { finiteNum } from './numbers';
import { numTag } from './importTags';
import { radToDeg } from '../../../prefs/units';
import { LAUNCH_SI } from '../../../prefs/launchUnits';

/** Rod angle degrees, wind m/s, altitude m, temperature kelvin, pressure pascal. */
export function readLaunchConditions(doc: Document): Partial<LaunchConditions> | undefined {
  return readSimulationLaunch(doc.querySelector('openrocket > simulations > simulation'));
}

export function readSimulationLaunch(simEl: Element | null): Partial<LaunchConditions> | undefined {
  const condEl = simEl?.querySelector(':scope > conditions');
  if (!condEl) return undefined;
  const launch: Partial<LaunchConditions> = {};

  const rodLen = numTag(condEl, 'launchrodlength', NaN);
  if (!Number.isNaN(rodLen)) launch.launchRodLengthM = rodLen;
  const rodAngle = numTag(condEl, 'launchrodangle', NaN);
  if (!Number.isNaN(rodAngle)) launch.launchRodAngleDeg = rodAngle;
  // Degrees on disk.
  const rodDir = numTag(condEl, 'launchroddirection', NaN);
  if (!Number.isNaN(rodDir)) launch.launchRodDirectionDeg = rodDir;
  const intoWind = (text(condEl, ':scope > launchintowind') ?? '').trim().toLowerCase();
  if (intoWind === 'true' || intoWind === 'false') launch.launchIntoWind = intoWind === 'true';

  readWind(condEl, launch);

  const alt = numTag(condEl, 'launchaltitude', NaN);
  if (!Number.isNaN(alt)) launch.launchAltitudeM = alt;
  const lat = numTag(condEl, 'launchlatitude', NaN);
  if (!Number.isNaN(lat)) launch.latitudeDeg = lat;
  const lon = numTag(condEl, 'launchlongitude', NaN);
  if (!Number.isNaN(lon)) launch.longitudeDeg = lon;

  readAtmosphere(condEl, launch);

  readGravity(condEl, launch);

  const gm = (text(condEl, ':scope > geodeticmethod') ?? '').toLowerCase();
  if (gm) launch.geodetic = gm === 'flat' ? 'flat' : gm === 'wgs84' ? 'wgs84' : 'spherical';
  readWeatherSource(condEl, launch);

  return Object.keys(launch).length > 0 ? launch : undefined;
}

function readGravity(condEl: Element, launch: Partial<LaunchConditions>): void {
  const el = condEl.querySelector(':scope > gravity');
  if (el) {
    const model = (el.getAttribute('model') ?? '').trim().toLowerCase();
    if (model === 'constant') {
      launch.gravityModel = 'constant';
      const g = numTag(el, 'value', NaN);
      if (!Number.isNaN(g)) launch.constantGravity = g;
    } else {
      // Desktop falls back to WGS for an unknown model.
      launch.gravityModel = 'wgs';
    }
    return;
  }
  const gravity = (text(condEl, ':scope > gravitymodel') ?? '').trim().toLowerCase();
  if (gravity === 'constant') {
    launch.gravityModel = 'constant';
    const g = numTag(condEl, 'constantgravity', NaN);
    if (!Number.isNaN(g)) launch.constantGravity = g;
  } else if (gravity === 'wgs') {
    launch.gravityModel = 'wgs';
  }
}

function readWeatherSource(condEl: Element, launch: Partial<LaunchConditions>): void {
  const el = condEl.querySelector(':scope > weathersource');
  if (!el) return;
  const a = (k: string) => el.getAttribute(k) ?? '';
  const num = (k: string) => finiteNum(a(k)) ?? NaN;
  const source = {
    provider: a('provider'),
    endpoint: a('endpoint'),
    date: a('date'),
    hour: num('hour'),
    timezone: a('timezone'),
    latitudeDeg: num('latitude'),
    longitudeDeg: num('longitude'),
    elevationM: num('elevation'),
    validAt: a('valid'),
    fetchedAt: a('fetched'),
    groups: a('groups').split(/\s+/).filter(Boolean),
    elevationApplied: a('elevationapplied') === 'true',
    ...(a('edited') === 'true' ? { edited: true as const } : {}),
  };
  if (isWeatherSource(source)) launch.weatherSource = restoredSource(source, launch as LaunchConditions);
}

function readWind(condEl: Element, launch: Partial<LaunchConditions>): void {
  const windEls = Array.from(condEl.querySelectorAll(':scope > wind'));
  const multilevelSelected = selectsMultilevel(condEl);

  const avgEl = windEls.find((w) => w.getAttribute('model') === 'average');
  let avg = avgEl ? numTag(avgEl, 'speed', NaN) : NaN;
  if (Number.isNaN(avg)) avg = numTag(condEl, 'windaverage', NaN);
  // A negative average flies at its magnitude from the stated heading.
  if (!Number.isNaN(avg)) launch.windAverage = Math.abs(avg);
  let sd = avgEl ? numTag(avgEl, 'standarddeviation', NaN) : NaN;
  if (Number.isNaN(sd)) {
    const turb = numTag(condEl, 'windturbulence', NaN);
    if (!Number.isNaN(turb) && !Number.isNaN(avg)) sd = stdDevForIntensity(avg, turb);
  }
  if (!Number.isNaN(sd)) launch.windStdDev = sd;
  let dirRad = avgEl ? numTag(avgEl, 'direction', NaN) : NaN;
  if (Number.isNaN(dirRad)) dirRad = numTag(condEl, 'winddirection', NaN);
  if (!Number.isNaN(dirRad)) launch.windDirectionDeg = radToDeg(dirRad);

  const mlEl = windEls.find((w) => (w.getAttribute('model') ?? '').toLowerCase() === 'multilevel');
  if (mlEl) {
    // Altitude has no `?? 0`: a duplicate 0 m level fails every run ("Wind level already exists").
    const levels = usableWindLevels(
      Array.from(mlEl.querySelectorAll(':scope > windlevel')).map((w) => {
        // Negative speed is wind from the opposite heading (MultiLevelPinkNoiseWindModel.addWindLevel).
        const speed = finiteNum(w.getAttribute('speed')) ?? 0;
        const deg = ((finiteNum(w.getAttribute('direction')) ?? 0) * 180) / Math.PI;
        return {
          altitudeM: finiteNum(w.getAttribute('altitude')),
          speed: Math.abs(speed),
          directionDeg: speed < 0 ? (((deg + 180) % 360) + 360) % 360 : deg,
          stddev: finiteNum(w.getAttribute('standarddeviation')) ?? 0,
        };
      }),
    );
    if (levels.length) {
      if (multilevelSelected) launch.windLevels = levels;
      else launch.keptWindLevels = levels;
    }
    const ref = (
      mlEl.getAttribute('altituderef') ??
      text(mlEl, ':scope > altitudereference') ??
      mlEl.getAttribute('altitudereference') ??
      ''
    )
      .trim()
      .toLowerCase();
    if (ref === 'agl' || ref === 'msl') launch.windAltitudeReference = ref;
  }
}

/** The last `<wind>` or `<windmodeltype>` in the file decides, as desktop reads it. */
function selectsMultilevel(condEl: Element): boolean {
  let multilevel = false;
  for (const el of Array.from(condEl.children)) {
    const tag = el.tagName.toLowerCase();
    const value =
      tag === 'wind' ? (el.getAttribute('model') ?? '') : tag === 'windmodeltype' ? (el.textContent ?? '') : null;
    if (value === null) continue;
    const model = value.trim().toLowerCase();
    if (model === 'average') multilevel = false;
    else if (model.includes('multilevel')) multilevel = true;
  }
  return multilevel;
}

function readAtmosphere(condEl: Element, launch: Partial<LaunchConditions>): void {
  const atmEl = condEl.querySelector(':scope > atmosphere');
  if (atmEl) {
    // Every other model flies ISA (AtmosphereHandler.storeSettings); a Settings default would fly custom air.
    if ((atmEl.getAttribute('model') ?? '').trim().toLowerCase() !== 'extendedisa') {
      launch.temperatureC = null;
      launch.pressureHPa = null;
      launch.relativeHumidity = null;
    } else {
      const tK = numTag(atmEl, 'basetemperature', NaN);
      if (!Number.isNaN(tK)) launch.temperatureC = LAUNCH_SI.degC.fromSi(tK);
      const pPa = numTag(atmEl, 'basepressure', NaN);
      if (!Number.isNaN(pPa)) launch.pressureHPa = LAUNCH_SI.hPa.fromSi(pPa);
      // A fraction.
      const rh = numTag(
        atmEl,
        'baserelativehumidity',
        numTag(atmEl, 'relativehumidity', numTag(condEl, 'launchrelativehumidity', NaN)),
      );
      if (!Number.isNaN(rh)) launch.relativeHumidity = rh;
    }
  }
  // Kelvin and pascal.
  const levelEls = [
    ...condEl.querySelectorAll(':scope > forecastlevel'),
    ...(atmEl?.querySelectorAll(':scope > forecastlevel') ?? []),
  ];
  const levels = usableAtmosphereLevels(
    levelEls.map((l) => {
      const at = (name: string) => finiteNum(l.getAttribute(name)) ?? NaN;
      return {
        altitudeM: at('altitude'),
        temperatureC: LAUNCH_SI.degC.fromSi(at('temperature')),
        pressureHPa: LAUNCH_SI.hPa.fromSi(at('pressure')),
        relativeHumidity: at('relativehumidity'),
      };
    }),
  );
  if (levels.length) launch.atmosphereLevels = levels;
}
