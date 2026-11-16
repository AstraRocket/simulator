// cspell:ignore simulationsteppermethod recoveryspeedwarning Lowspeedwarning recoverydroguemainhighspeedwarning recoverydroguemainlowspeedwarning draglookup stabilitylookup stabilitylookupcsv -- OpenRocket .ork element names
import i18n from '../../../i18n';
import type { FlightSummary } from '../../../engine/openRocketEngine';
import type { LaunchConditions } from '../../design/orkTree';
import { xmlText as text } from '../xmlUtil';
import { readSimulationLaunch } from './importLaunch';
import { KNOWN_CONDITIONS_TAGS, KNOWN_SIMULATION_TAGS, readPassthrough, wrapConditionsChild } from './passthrough';
import { KeyedError } from '../../../i18n/keyedError';
import { MAX_SIMULATIONS } from './importLimits';
import { finiteNum } from './numbers';
import { stepperOf, type SimPrefs } from '../../flight/simulations';
import { SIM_BOUNDS } from '../../storage/settings';
import { FLIGHT_DATA_ATTRS, SIM_PREF_TAGS, OPTIONAL_FLIGHT_DATA } from './simulationTags';

/** A warning threshold is any positive speed (m/s). */
const WARN_BOUNDS = { min: Number.MIN_VALUE, max: Number.MAX_VALUE };

export interface OrkSimulation {
  name: string;
  configId: string | null;
  launch?: Partial<LaunchConditions>;
  summary?: FlightSummary;
  outdated: boolean;
  prefs?: Partial<SimPrefs>;
  /** `<conditions>` children are wrapped by `wrapConditionsChild`. */
  xmlExtra?: string[];
  /** Desktop flew a drag or stability lookup table, which the kernel does not. */
  lookupTables?: true;
}

// SimulationConditionsHandler: desktop flies these in place of Barrowman; the kernel always flies Barrowman
// (SimulationOptions). The element is carried through, so saving keeps it.
const LOOKUP_TAGS = new Set(['draglookup', 'stabilitylookup', 'draglookupcsv', 'stabilitylookupcsv']);

const fliesLookupTable = (condEl: Element | null): boolean =>
  !!condEl &&
  [...condEl.children].some(
    (c) => LOOKUP_TAGS.has(c.tagName.toLowerCase()) && (c.children.length > 0 || (c.textContent ?? '').trim() !== ''),
  );

export function readSimulations(doc: Document): OrkSimulation[] {
  const els = doc.querySelectorAll('openrocket > simulations > simulation');
  if (els.length > MAX_SIMULATIONS) throw new KeyedError('errors.file.tooManySimulations');
  return [...els].map((el, i) => {
    const flight = el.querySelector(':scope > flightdata');
    const launch = readSimulationLaunch(el);
    const condEl = el.querySelector(':scope > conditions');
    const carried = [
      ...(readPassthrough(el, KNOWN_SIMULATION_TAGS) ?? []),
      ...((condEl && readPassthrough(condEl, KNOWN_CONDITIONS_TAGS)) ?? []).map(wrapConditionsChild),
    ];
    const xmlExtra = carried.length ? carried : undefined;
    const lookup = fliesLookupTable(condEl);
    return {
      name: (text(el, ':scope > name') ?? '').trim() || i18n.t('sims.untitled', { n: i + 1 }),
      configId: (text(el, ':scope > conditions > configid') ?? '').trim() || null,
      ...(launch ? { launch } : {}),
      ...(flight ? { summary: summaryOf(flight) } : {}),
      // A summary flown on a lookup table is not what a rerun here gives.
      outdated: lookup || (el.getAttribute('status') ?? '').trim().toLowerCase() === 'outdated',
      ...(lookup ? { lookupTables: true as const } : {}),
      ...(xmlExtra ? { xmlExtra } : {}),
      ...simulationPrefs(condEl),
    };
  });
}

const PREF_BOUNDS: Partial<Record<keyof SimPrefs, { min: number; max: number }>> = {
  timeStep: SIM_BOUNDS.timeStep,
  maxTime: SIM_BOUNDS.maxTime,
};

function simulationPrefs(condEl: Element | null): { prefs?: Partial<SimPrefs> } {
  if (!condEl) return {};
  const numbers: Partial<Record<keyof SimPrefs, number>> = {};
  for (const [key, tag] of SIM_PREF_TAGS) {
    const { min, max } = PREF_BOUNDS[key] ?? WARN_BOUNDS;
    const v = finiteNum(text(condEl, `:scope > ${tag}`) ?? undefined);
    if (v !== undefined && v >= min && v <= max) numbers[key] = v;
  }
  const prefs = numbers as Partial<SimPrefs>;
  const stepper = stepperOf(text(condEl, ':scope > simulationsteppermethod')?.trim(), null);
  if (stepper) prefs.stepper = stepper;
  return Object.keys(prefs).length ? { prefs } : {};
}

function summaryOf(el: Element): FlightSummary {
  const out: Record<string, number | null> = {};
  for (const [key, attr] of FLIGHT_DATA_ATTRS) {
    const v = finiteNum(el.getAttribute(attr));
    out[key] = v ?? (OPTIONAL_FLIGHT_DATA.has(key) ? null : NaN);
  }
  return out as unknown as FlightSummary;
}
