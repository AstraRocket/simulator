import type { UnitSymbols } from '../../prefs/units';
import type { LaunchConditions } from '../design/orkTree';
import type { LauncherKind } from '../design/launcher';
import { launchLimitViolations, limitNote } from '../flight/safetyLimits';
import type { PowerClass } from '../flight/powerClass';
import type { ImportNote } from './importNote';

export function importNotes(
  fileNotes: ImportNote[],
  flights: readonly { launch: LaunchConditions; powerClass: PowerClass }[],
  launcher: LauncherKind | null,
  units: UnitSymbols,
): ImportNote[] {
  const seen = new Set<string>();
  const added: ImportNote[] = [];
  for (const f of flights) {
    for (const v of launchLimitViolations(f.launch, f.powerClass)) {
      const note = limitNote(v, units, launcher);
      const wording = JSON.stringify(note);
      if (seen.has(wording)) continue;
      seen.add(wording);
      added.push(note);
    }
  }
  return added.length ? [...fileNotes, ...added] : fileNotes;
}
