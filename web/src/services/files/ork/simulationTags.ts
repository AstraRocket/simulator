// cspell:ignore recoveryspeedwarning Lowspeedwarning recoverydroguemainhighspeedwarning recoverydroguemainlowspeedwarning -- OpenRocket .ork element names
import type { FlightSummary } from '../../../engine/openRocketEngine';
import type { SimPrefs } from '../../flight/simulations';
import type { OrkSimPrefs } from '../orkTypes';

/** In the order desktop writes them. */
export const FLIGHT_DATA_ATTRS: readonly (readonly [keyof FlightSummary, string])[] = [
  ['maxAltitude', 'maxaltitude'],
  ['maxVelocity', 'maxvelocity'],
  ['maxAcceleration', 'maxacceleration'],
  ['maxMachNumber', 'maxmach'],
  ['timeToApogee', 'timetoapogee'],
  ['flightTime', 'flighttime'],
  ['groundHitVelocity', 'groundhitvelocity'],
  ['launchRodVelocity', 'launchrodvelocity'],
  ['deploymentVelocity', 'deploymentvelocity'],
  ['optimumDelay', 'optimumdelay'],
];

export const OPTIONAL_FLIGHT_DATA: ReadonlySet<keyof FlightSummary> = new Set(['deploymentVelocity', 'optimumDelay']);

/** The capital L in `drogueLowspeedwarning` is upstream's exact spelling. */
export const SIM_PREF_TAGS: readonly (readonly [keyof OrkSimPrefs & keyof SimPrefs, string])[] = [
  ['timeStep', 'timestep'],
  ['maxTime', 'maxtime'],
  ['deploymentSpeedWarn', 'recoveryspeedwarning'],
  ['drogueLowSpeedWarn', 'drogueLowspeedwarning'],
  ['mainHighSpeedWarn', 'recoverydroguemainhighspeedwarning'],
  ['mainLowSpeedWarn', 'recoverydroguemainlowspeedwarning'],
];
