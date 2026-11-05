import type { LaunchConditions, LaunchPatch } from '../../services/design/orkTree';
import type { RequiredLaunchKey } from '../../services/flight/requiredLaunch';
import type { Units } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { fmtUpTo, ladderDigits, withUnit } from '../../i18n/format';
import { LAUNCH_SI, type LaunchUnitKind } from '../../prefs/launchUnits';
import type { useLauncherT } from '../common/useLauncher';

export interface LaunchSectionProps {
  launch: LaunchConditions;
  onChange: (patch: LaunchPatch) => void;
  onCommit?: () => void;
  t: ReturnType<typeof useLauncherT>;
  u: Units;
  mixed: (k: keyof LaunchConditions) => boolean;
  req: (k: RequiredLaunchKey) => { required: true; missing: boolean };
}

export function capFor(u: Units, kind: LaunchUnitKind, field: string, si: number): string {
  const fu = u.at(unitScope('launch', field), LAUNCH_SI[kind].q);
  const ui = fu.toUi(si);
  return withUnit(fmtUpTo(ui, ladderDigits(ui)), fu.sym);
}
