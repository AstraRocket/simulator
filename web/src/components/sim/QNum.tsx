import { UnitChip } from '../common/UnitChip';
import type { Units } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { onSi } from '../../prefs/entryValue';
import { LAUNCH_SI, type LaunchUnitKind } from '../../prefs/launchUnits';
import { NumberRow, type NumberRowMarks } from '../common/NumberRow';

/** `value`/`onChange` speak the stored convention (`LAUNCH_SI`); `stepSi`/`minSi` are SI. */
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
  chipLabel?: string;
  field: string;
  kind: LaunchUnitKind;
  u: Units;
  value: number | null;
  stepSi: number;
  minSi?: number;
  maxSi?: number;
  commitOnBlur?: boolean;
} & NumberRowMarks) {
  const c = LAUNCH_SI[kind];
  const scope = unitScope('launch', field);
  const fu = u.at(scope, c.q);
  return (
    <NumberRow
      label={label}
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
      onChange={onSi(fu, onChange, c.fromSi)}
    />
  );
}
