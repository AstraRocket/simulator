import type { FieldUnit } from '../../prefs/useUnits';
import { onSi } from '../../prefs/entryValue';
import { SIM_BOUNDS } from '../../services/storage/settings';
import { degToRad } from '../../prefs/units';
import type { SimStepper } from '../../engine/openRocketEngine';

/**
 * Keys stay literal for the i18n key scan. `maxTime / timeStep` is the iteration
 * count, so both are bounded (`SIM_BOUNDS`). The angle step is stored in radians.
 */
export const SIM_OPTION_FIELDS = [
  { key: 'timeStep', label: 'settings.timeStep', unit: 'second', step: 0.01, placeholderDigits: 4 },
  { key: 'maxTime', label: 'settings.maxTime', unit: 'second', step: 60, placeholderDigits: 1 },
  {
    key: 'maxAngleStep',
    label: 'settings.maxAngleStep',
    hint: 'settings.maxAngleStepHint',
    unit: 'angle',
    step: degToRad(0.5),
    placeholderDigits: 3,
  },
] as const;

export type SimOptionField = (typeof SIM_OPTION_FIELDS)[number];

/** Fixed: the bridge always builds a BarrowmanCalculator, with no supersonic-aero extensions. */
export const KERNEL_METHOD_ROWS = [{ label: 'settings.calcMethod', value: 'settings.calcMethodValue' }] as const;

export const STEPPER_LABELS: Record<SimStepper, string> = {
  rk4: 'settings.simMethodRk4',
  rk6: 'settings.simMethodRk6',
};

export interface SimOptionUnit {
  sym: string;
  toUi: (si: number) => number;
  step: number;
  min: number;
  max: number;
  entry: (commit: (si: number | null) => void) => (ui: number | null) => void;
}

export function simOptionUnit(f: SimOptionField, angle: FieldUnit, secondSym: string): SimOptionUnit {
  const { min, max } = SIM_BOUNDS[f.key];
  if (f.unit === 'angle') {
    return {
      sym: angle.sym,
      toUi: angle.toUi,
      step: angle.step(f.step),
      min: angle.toUi(min),
      max: angle.toUi(max),
      entry: (commit) => onSi(angle, commit),
    };
  }
  return { sym: secondSym, toUi: (si) => si, step: f.step, min, max, entry: (commit) => commit };
}
