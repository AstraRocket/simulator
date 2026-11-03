import { UnitChip } from '../common/UnitChip';
import type { Units } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { onSi } from '../../prefs/entryValue';
import { LAUNCH_SI, type LaunchUnitKind } from '../../prefs/launchUnits';
import { NumberRow, type NumberRowMarks } from '../common/NumberRow';

/**
 * A launch-condition field in the user's chosen unit. `value`/`onChange` speak
 * the stored convention (see `LAUNCH_SI` in `launchUnits.ts`); `stepSi`/`minSi`
 * are given in SI, so a sensible 0.5 m/s or 10 m stays sensible once it is
 * shown in ft/s or ft.
 */
export function QNum({
  label,
  chipLabel,
  field,
  kind,
  u,
  value,
  stepSi,
  minSi,
  maxSi,
  placeholder,
  hint,
  caution,
  mixed,
  required,
  missing,
  commitOnBlur,
  onChange,
}: {
  label: string;
  /**
   * Accessible name for the unit chip, when the visible label is ambiguous
   * outside this panel. "Length" and "Direction" read fine under their group
   * headings, but a screen reader announces the chip on its own, and the stats
   * strip has its own "Length", so two chips on one screen would announce the same.
   */
  chipLabel?: string;
  /** Names this launch field, so its unit is its own (see `unitScope`). */
  field: string;
  kind: LaunchUnitKind;
  u: Units;
  value: number | null;
  stepSi: number;
  minSi?: number;
  /** Upper bound in SI, converted like `minSi` so it holds in any unit. */
  maxSi?: number;
  /** Change once, on blur, rather than per keystroke: for a field each change of which is an undo step. */
  commitOnBlur?: boolean;
} & NumberRowMarks) {
  const c = LAUNCH_SI[kind];
  const scope = unitScope('launch', field);
  const fu = u.at(scope, c.q);
  return (
    <NumberRow
      label={label}
      // The field's own label, not just the quantity: the launch panel shows
      // three angle chips (rod angle, rod direction, wind direction) and two
      // wind speed ones at once, which otherwise all announce identically.
      unit={<UnitChip label={chipLabel ?? label} quantity={c.q} scope={scope} />}
      step={fu.step(stepSi)}
      min={minSi !== undefined ? fu.toUi(minSi) : undefined}
      max={maxSi !== undefined ? fu.toUi(maxSi) : undefined}
      placeholder={placeholder}
      hint={hint}
      caution={caution}
      mixed={mixed}
      required={required}
      missing={missing}
      commitOnBlur={commitOnBlur}
      value={value === null ? null : fu.toUi(c.toSi(value))}
      // Two legs: the box's unit to SI, then SI to what the field is stored
      // in (degrees, Celsius, hPa). `onSi` checks both, so neither an entry
      // that overflows on conversion nor one that overflows on the way to the
      // stored convention reaches the launch conditions.
      onChange={onSi(fu, onChange, c.fromSi)}
    />
  );
}
