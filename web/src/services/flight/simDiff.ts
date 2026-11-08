import type { Simulation, SimPrefs } from './simulations';
import type { LaunchConditions } from '../design/orkTree';
import { stableJson } from '../app/stableJson';

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // null and undefined both mean "not set".
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  // List order counts (wind levels are not kept sorted); key order does not.
  return stableJson(a) === stableJson(b);
}

function diffKeys<T extends object>(records: (T | undefined)[]): Set<keyof T> {
  const out = new Set<keyof T>();
  if (records.length < 2) return out;
  const [first, ...rest] = records;
  const keys = new Set<string>();
  for (const r of records) for (const k of Object.keys(r ?? {})) keys.add(k);
  for (const k of keys) {
    const key = k as keyof T;
    if (rest.some((r) => !same(r?.[key], first?.[key]))) out.add(key);
  }
  return out;
}

export function launchDiffKeys(sims: Simulation[]): Set<keyof LaunchConditions> {
  return diffKeys(sims.map((s) => s.launch));
}

// Compares overrides, not effective values: pinning the global's own number still differs from unset.
export function prefDiffKeys(sims: Simulation[]): Set<keyof SimPrefs> {
  return diffKeys(sims.map((s) => s.prefs));
}
