import type { FieldUnit } from '../../prefs/useUnits';
import { onSi } from '../../prefs/entryValue';
import { SIM_BOUNDS } from '../../services/storage/settings';
import { degToRad } from '../../prefs/units';

/**
 * The solver options, in the order both editors show them: Settings (the
 * global default) and the simulation editor (each simulation's override). One
 * table, so a label, hint, step or bound cannot reach one screen and miss the
 * other. Keys stay literal so the i18n key scan can find them.
 *
 * The time step is the solver's own dt; `maxTime / timeStep` is its iteration
 * count, so both ends are bounded (`SIM_BOUNDS`): 1000000 s, a plausible slip
 * for 1000, at the default 0.05 s step would ask for 20 M integration steps
 * with no way to interrupt the run. The angle step is stored in radians like
 * the kernel's field and edited in the user's angle unit.
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

/**
 * What the kernel runs, stated rather than assumed, as the desktop states it.
 * Fixed, not chosen: the bridge always builds a BarrowmanCalculator and the RK4
 * stepper, and the supersonic-aero extensions the engine can carry are not
 * wired into the web app.
 */
export const KERNEL_METHOD_ROWS = [
  { label: 'settings.calcMethod', value: 'settings.calcMethodValue' },
  { label: 'settings.simMethod', value: 'settings.simMethodValue' },
] as const;

/** One option row in the unit it is shown in: symbol, step and bounds there. */
export interface SimOptionUnit {
  sym: string;
  toUi: (si: number) => number;
  step: number;
  min: number;
  max: number;
  /** The box's handler for an entry, given what to do with the SI number. */
  entry: (commit: (si: number | null) => void) => (ui: number | null) => void;
}

/**
 * How `f` reads: seconds as typed (the seconds symbol is the reader's own,
 * `t('units.second')`), the angle step through its unit chip.
 */
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
