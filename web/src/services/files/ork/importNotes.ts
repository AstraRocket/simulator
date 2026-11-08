import type { OrkFlightConfig } from '../orkTypes';
import { keyedNote, type ImportNote } from '../importNote';

export function ignoredNotes(ignored: Set<string>): ImportNote[] {
  return [...ignored].map((name) => keyedNote('importNote.skippedUnsupported', { name }));
}

export function configNotes(rocketEl: Element, configs: OrkFlightConfig[]): ImportNote[] {
  const notes: ImportNote[] = [];
  if (configs.length > 1) {
    const mountMotorEls = Array.from(rocketEl.querySelectorAll('motormount > motor'));
    if (mountMotorEls.length === 0) {
      notes.push(keyedNote('importNote.configsNoMotors', { total: configs.length }));
    }
  } else if (configs.length === 0) {
    // Report a count, never a UUID.
    const strayIds = new Set<string>();
    for (const m of Array.from(rocketEl.getElementsByTagName('motor'))) {
      const id = m.getAttribute('configid');
      if (id) strayIds.add(id);
    }
    if (strayIds.size > 1) {
      notes.push(keyedNote('importNote.strayConfigs', { total: strayIds.size }));
    }
  }
  return notes;
}
