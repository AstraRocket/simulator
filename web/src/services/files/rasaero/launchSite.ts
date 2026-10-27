import type { LaunchConditions } from '../../design/orkTree';
import { FT, MPH, fmt, type Cdx1Writer } from './units';
import { degToRad, siToUi } from '../../../prefs/units';
import { siteAtmosphere } from '../../flight/recoverySizing';
import { DEFAULT_HEADING_DEG, surfaceWind, usableWindLevels } from '../../flight/windLevels';

// RASAero II's standard atmosphere, as desktop's RASAeroCommonConstants holds
// it: sea-level pressure (psi), pressure-altitude lapse (1/ft) and exponent,
// and the conversion of its barometric pressure input from in-Hg to psi.
const SEA_LEVEL_PSI = 14.6958;
const PRESSURE_LAPSE = 6.87535e-6;
const PRESSURE_EXPONENT = 5.2561;
const BAROMETRIC_EXPONENT = 0.19026;
const INHG_TO_PSI = 0.49117;
const PSI_TO_PA = 6894.757;

/**
 * RASAero's barometric pressure input (in-Hg) for a launch site pressure (Pa)
 * at an elevation (ft): the pressure reduced to sea level, which RASAero turns
 * back into the site's pressure. Desktop's
 * RASAeroCommonConstants.OPENROCKET_TO_RASAERO_BAROMETRIC_PRESSURE.
 */
export function rasaeroBarometricPressure(pressurePa: number, altitudeFt: number): number {
  const pressureAltitude =
    (1 - Math.pow(pressurePa / PSI_TO_PA / SEA_LEVEL_PSI, 1 / PRESSURE_EXPONENT)) / PRESSURE_LAPSE;
  return (
    (SEA_LEVEL_PSI * Math.pow(1 - PRESSURE_LAPSE * (pressureAltitude - altitudeFt), 1 / BAROMETRIC_EXPONENT)) /
    INHG_TO_PSI
  );
}

/**
 * Launch site back to RASAero units (feet / °F / in-Hg / mph), as desktop's
 * LaunchSiteDTO converts the simulated conditions:
 *
 * - the temperature the flight starts in: the typed one, or the standard
 *   atmosphere's at the site elevation;
 * - pressure 0 (RASAero's "not entered", the standard pressure at the site)
 *   for the standard atmosphere, else the site pressure reduced to sea level;
 * - the headwind component of the wind along the rod's heading, since
 *   RASAero's wind is one signed speed, positive into the rocket's face. A
 *   wind profile has no RASAero equivalent: its lowest level is written, with
 *   a warning.
 *
 * A forecast atmosphere is not read: with the site's own temperature and
 * pressure blank it is written as the standard atmosphere.
 */
export function writeLaunchSite(w: Cdx1Writer, launch: Partial<LaunchConditions> | undefined): void {
  const { emit } = w;
  const altitudeFt = (launch?.launchAltitudeM ?? 0) * FT;
  const air = siteAtmosphere(launch ?? {});
  let windSpeed: number;
  let windDeg: number;
  const levels = usableWindLevels(launch?.windLevels ?? []);
  if (levels.length) {
    const lowest = levels.reduce((a, b) => (b.altitudeM < a.altitudeM ? b : a));
    windSpeed = lowest.speed;
    windDeg = lowest.directionDeg;
    w.warn({ key: 'errors.exportRasaeroWindLevels' });
  } else {
    // A negative single wind flies as its magnitude (see surfaceWind).
    windSpeed = Math.abs(launch?.windAverage ?? 0);
    windDeg = launch?.windDirectionDeg ?? DEFAULT_HEADING_DEG;
  }
  // "Launch into the wind" aims the rod at the wind at the pad, as
  // SimulationOptions.getLaunchRodDirection does.
  const rodDeg = launch?.launchIntoWind
    ? surfaceWind(launch as LaunchConditions).headingDeg
    : (launch?.launchRodDirectionDeg ?? DEFAULT_HEADING_DEG);
  const headwind = windSpeed * Math.cos(degToRad(windDeg - rodDeg));
  emit('<LaunchSite>');
  emit(`<Altitude>${fmt(altitudeFt)}</Altitude>`);
  emit(`<Pressure>${air.standard ? '0' : fmt(rasaeroBarometricPressure(air.p, altitudeFt))}</Pressure>`);
  emit(`<RodAngle>${fmt(launch?.launchRodAngleDeg ?? 0)}</RodAngle>`);
  emit(`<RodLength>${launch?.launchRodLengthM != null ? fmt(launch.launchRodLengthM * FT) : '10'}</RodLength>`);
  emit(`<Temperature>${fmt(siToUi('temperature', '°F', air.t))}</Temperature>`);
  emit(`<WindSpeed>${fmt(headwind * MPH)}</WindSpeed>`);
  emit('</LaunchSite>');
}
