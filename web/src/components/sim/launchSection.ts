import type { LaunchConditions, LaunchPatch } from '../../services/design/orkTree';
import type { RequiredLaunchKey } from '../../services/flight/requiredLaunch';
import type { Units } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { fmtUpTo, ladderDigits, withUnit } from '../../i18n/format';
import { LAUNCH_SI, SITE_ALTITUDE_FIELD, type LaunchUnitKind } from '../../prefs/launchUnits';
import type { useLauncherT } from '../common/useLauncher';
import {
  compassPointIndex,
  magneticToTrue,
  siteDeclination,
  trueToMagnetic,
  type NorthReference,
} from '../../services/flight/bearing';

/** How the panel's bearing fields read and write: stored true, shown against `ref`. */
export interface NorthEntry {
  /** Magnetic only when the site has a declination; else true, whatever the setting. */
  ref: NorthReference;
  show: (trueDeg: number) => number;
  /** Per simulation: each converts with its own site's declination. */
  store: (shownDeg: number, launch: LaunchConditions) => number;
}

export function northEntry(pref: NorthReference, shown: LaunchConditions): NorthEntry {
  const declination = pref === 'magnetic' ? siteDeclination(shown) : null;
  if (declination === null) return { ref: 'true', show: (d) => d, store: (d) => d };
  return {
    ref: 'magnetic',
    // A tenth is finer than a hand compass reads; more is noise from the conversion.
    show: (d) => (Math.round(trueToMagnetic(d, declination) * 10) / 10) % 360,
    store: (d, l) => magneticToTrue(d, siteDeclination(l) ?? 0),
  };
}

/** A bearing's compass point and its reference north, for the hint under a direction field. */
export function bearingHint(t: LaunchSectionProps['t'], north: NorthEntry, shownDeg: number): string {
  const points = t('launch.compassPoints').split(' ');
  return t(`launch.bearingHint_${north.ref}`, { point: points[compassPointIndex(shownDeg)] ?? '' });
}

export interface LaunchSectionProps {
  launch: LaunchConditions;
  onChange: (patch: LaunchPatch) => void;
  onCommit?: () => void;
  t: ReturnType<typeof useLauncherT>;
  u: Units;
  mixed: (k: keyof LaunchConditions) => boolean;
  req: (k: RequiredLaunchKey) => { required: true; missing: boolean };
  north: NorthEntry;
}

/** The launch site elevation's own unit, as its field in the Launch panel shows it. */
export function siteAltitudeUnit(u: Units) {
  return u.at(unitScope('launch', SITE_ALTITUDE_FIELD), 'distance');
}

export function capFor(u: Units, kind: LaunchUnitKind, field: string, si: number): string {
  const fu = u.at(unitScope('launch', field), LAUNCH_SI[kind].q);
  const ui = fu.toUi(si);
  return withUnit(fmtUpTo(ui, ladderDigits(ui)), fu.sym);
}
