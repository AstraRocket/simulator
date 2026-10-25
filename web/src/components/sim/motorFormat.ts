import { withUnit, withFixedUnit } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import type { TFunction } from 'i18next';
import type { Units } from '../../prefs/useUnits';
import type { Quantity } from '../../prefs/units';
import { PLUGGED_DELAY } from '../../engine/openRocketEngine';

/**
 * The readout formatters the motor panels share (MotorDetail, MotorSpecDialog,
 * MotorCombinePane and the dashboard grid), so they format readouts the same way.
 */

/**
 * An SI value in the user's unit with its symbol: "61.0 N·s". `scale` lifts a
 * catalog field (mm / g, see CatalogMotor) to SI first; MotorSpec fields are
 * already SI and pass 1.
 */
export const inUserUnit = (
  u: Units,
  quantity: Quantity,
  v: number | null | undefined,
  scale = 1,
  digits?: number,
): string =>
  v == null || !Number.isFinite(v) ? NO_VALUE : withUnit(u.fmt(quantity, v * scale, digits), u.sym(quantity));

const TYPE_KEY: Record<string, string> = { SU: 'typeSU', reload: 'typeReload', hybrid: 'typeHybrid' };

/** A catalog motor type ("SU", "reload", "hybrid") in the UI language; a type the catalog adds later shows as written. */
export const motorTypeLabel = (type: string, t: TFunction): string =>
  TYPE_KEY[type] ? t(`motorDlg.${TYPE_KEY[type]}`) : type;

/** A motor's ejection delay as the motor card and the spec dialog read it: plugged, or the delay in seconds. */
export const ejectionDelayText = (delay: number, t: TFunction): string =>
  delay >= PLUGGED_DELAY ? t('motor.plugged') : withFixedUnit(delay, t('units.second'));
