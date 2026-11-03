import type { LaunchConditions, LaunchPatch } from '../../services/design/orkTree';
import type { RequiredLaunchKey } from '../../services/flight/requiredLaunch';
import type { Units } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { fmtUpTo, ladderDigits, withUnit } from '../../i18n/format';
import { LAUNCH_SI, type LaunchUnitKind } from '../../prefs/launchUnits';
import type { useLauncherT } from '../common/useLauncher';

/** What every card of the launch panel (LaunchPanel.tsx) is handed. */
export interface LaunchSectionProps {
  launch: LaunchConditions;
  /** See `LaunchPanel`'s `onChange`: applied to every simulation being edited. */
  onChange: (patch: LaunchPatch) => void;
  /** Close the current edit's undo entry; discrete controls call it at once. */
  onCommit?: () => void;
  t: ReturnType<typeof useLauncherT>;
  u: Units;
  /** Whether the simulations being edited together disagree on `k`. */
  mixed: (k: keyof LaunchConditions) => boolean;
  /** The marks of a required field: `missing` when it is currently empty. */
  req: (k: RequiredLaunchKey) => { required: true; missing: boolean };
}

/**
 * A safety-code cap in the unit its own field is shown in, resolved the way
 * QNum resolves it, chip override included. A hint that quotes the rule in a
 * different unit than the box under it is worse than no hint.
 */
export function capFor(u: Units, kind: LaunchUnitKind, field: string, si: number): string {
  const fu = u.at(unitScope('launch', field), LAUNCH_SI[kind].q);
  const ui = fu.toUi(si);
  return withUnit(fmtUpTo(ui, ladderDigits(ui)), fu.sym);
}
