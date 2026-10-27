// cspell:ignore recoveryspeedwarning Lowspeedwarning recoverydroguemainhighspeedwarning recoverydroguemainlowspeedwarning -- OpenRocket .ork element names
import type { FlightSummary } from '../../../engine/openRocketEngine';
import type { SimPrefs } from '../../flight/simulations';
import type { OrkSimPrefs } from '../orkTypes';

/**
 * The `.ork` names a simulation's summary and run settings go under, held once
 * for the reader and the writer, in the order desktop writes them.
 */

/** The `<flightdata>` attribute each summary figure is written as. */
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

/** Summary figures a flight may lack outright (no deployment), which read as null rather than NaN. */
export const OPTIONAL_FLIGHT_DATA: ReadonlySet<keyof FlightSummary> = new Set(['deploymentVelocity', 'optimumDelay']);

/**
 * The `<conditions>` element each per-simulation setting is written as, in
 * upstream OpenRocketSaver's order. The drogue element's capital L is
 * upstream's own spelling, which its reader matches exactly.
 */
export const SIM_PREF_TAGS: readonly (readonly [keyof OrkSimPrefs & keyof SimPrefs, string])[] = [
  ['timeStep', 'timestep'],
  ['maxTime', 'maxtime'],
  ['deploymentSpeedWarn', 'recoveryspeedwarning'],
  ['drogueLowSpeedWarn', 'drogueLowspeedwarning'],
  ['mainHighSpeedWarn', 'recoverydroguemainhighspeedwarning'],
  ['mainLowSpeedWarn', 'recoverydroguemainlowspeedwarning'],
];
