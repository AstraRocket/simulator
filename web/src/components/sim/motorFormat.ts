import { withUnit, withFixedUnit } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import type { TFunction } from 'i18next';
import type { Units } from '../../prefs/useUnits';
import type { Quantity } from '../../prefs/units';
import { PLUGGED_DELAY } from '../../engine/openRocketEngine';

/** `scale` lifts a catalog field (mm / g) to SI; MotorSpec fields are already SI and pass 1. */
export const inUserUnit = (
  u: Units,
  quantity: Quantity,
  v: number | null | undefined,
  scale = 1,
  digits?: number,
): string =>
  v == null || !Number.isFinite(v) ? NO_VALUE : withUnit(u.fmt(quantity, v * scale, digits), u.sym(quantity));

const TYPE_KEY: Record<string, string> = { SU: 'typeSU', reload: 'typeReload', hybrid: 'typeHybrid' };

export const motorTypeLabel = (type: string, t: TFunction): string =>
  TYPE_KEY[type] ? t(`motorDlg.${TYPE_KEY[type]}`) : type;

export const ejectionDelayText = (delay: number, t: TFunction): string =>
  delay >= PLUGGED_DELAY ? t('motor.plugged') : withFixedUnit(delay, t('units.second'));
