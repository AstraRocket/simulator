import type { LaunchConditions } from '../../design/orkTree';
import { FT, MPH, fmt, type Cdx1Writer } from './units';
import { degToRad, siToUi } from '../../../prefs/units';
import { siteAtmosphere } from '../../flight/recoverySizing';
import { DEFAULT_HEADING_DEG, surfaceWind, usableWindLevels } from '../../flight/windLevels';

// Desktop RASAeroCommonConstants (psi, 1/ft, in-Hg).
const SEA_LEVEL_PSI = 14.6958;
const PRESSURE_LAPSE = 6.87535e-6;
const PRESSURE_EXPONENT = 5.2561;
const BAROMETRIC_EXPONENT = 0.19026;
const INHG_TO_PSI = 0.49117;
const PSI_TO_PA = 6894.757;

/** Sea-level in-Hg, as desktop RASAeroCommonConstants.OPENROCKET_TO_RASAERO_BAROMETRIC_PRESSURE. */
function rasaeroBarometricPressure(pressurePa: number, altitudeFt: number): number {
  const pressureAltitude =
    (1 - Math.pow(pressurePa / PSI_TO_PA / SEA_LEVEL_PSI, 1 / PRESSURE_EXPONENT)) / PRESSURE_LAPSE;
  return (
    (SEA_LEVEL_PSI * Math.pow(1 - PRESSURE_LAPSE * (pressureAltitude - altitudeFt), 1 / BAROMETRIC_EXPONENT)) /
    INHG_TO_PSI
  );
}

/** As desktop LaunchSiteDTO; RASAero wind is one signed headwind speed, positive into the rocket's face. */
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
  // Into the wind aims at the pad's wind, as SimulationOptions.getLaunchRodDirection.
  const rodDeg = launch?.launchIntoWind
    ? surfaceWind(launch as LaunchConditions).headingDeg
    : (launch?.launchRodDirectionDeg ?? DEFAULT_HEADING_DEG);
  const headwind = windSpeed * Math.cos(degToRad(windDeg - rodDeg));
  emit('<LaunchSite>');
  emit(`<Altitude>${fmt(altitudeFt)}</Altitude>`);
  // 0 is RASAero's "not entered" (standard atmosphere).
  emit(`<Pressure>${air.standard ? '0' : fmt(rasaeroBarometricPressure(air.p, altitudeFt))}</Pressure>`);
  emit(`<RodAngle>${fmt(launch?.launchRodAngleDeg ?? 0)}</RodAngle>`);
  emit(`<RodLength>${launch?.launchRodLengthM != null ? fmt(launch.launchRodLengthM * FT) : '10'}</RodLength>`);
  emit(`<Temperature>${fmt(siToUi('temperature', '°F', air.t))}</Temperature>`);
  emit(`<WindSpeed>${fmt(headwind * MPH)}</WindSpeed>`);
  emit('</LaunchSite>');
}
