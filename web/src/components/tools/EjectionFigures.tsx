import { useTranslation } from 'react-i18next';
import { unitScope } from '../../prefs/units';
import { blackPowderMass, pinShearPressure } from '../../services/flight/ejectionCharge';
import { useScopedUnit } from '../common/useScopedUnit';

export function EjectionFigures({
  boreM,
  lengthM,
  pressurePa,
  pinCount,
  pinForceN,
}: {
  boreM: number | null;
  lengthM: number | null;
  pressurePa: number | null;
  pinCount: number | null;
  pinForceN: number | null;
}) {
  const { t } = useTranslation();
  const massUnit = useScopedUnit(unitScope('ejection', 'charge'), 'mass');
  const pinMassUnit = useScopedUnit(unitScope('ejection', 'pinCharge'), 'mass');
  const pressureUnit = useScopedUnit(unitScope('ejection', 'pinPressure'), 'pressure');

  const charge =
    pressurePa != null && boreM != null && lengthM != null ? blackPowderMass(pressurePa, boreM, lengthM) : null;
  const pinPressure =
    pinCount != null && pinForceN != null && boreM != null ? pinShearPressure(pinCount, pinForceN, boreM) : null;
  const pinCharge =
    pinPressure != null && lengthM != null && boreM != null ? blackPowderMass(pinPressure, boreM, lengthM) : null;
  const short = pinPressure != null && pressurePa != null && pressurePa < pinPressure;

  if (charge == null) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-ink-muted">{t('ejectionTool.charge')}</span>
        <span className="text-sm font-semibold tabular-nums text-ink">
          {massUnit.fmt(charge, 2)} {massUnit.chip(t('ejectionTool.charge'))}
        </span>
      </div>
      {pinPressure != null && pinCharge != null && (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-ink-muted">{t('ejectionTool.pinPressure')}</span>
            <span className="text-sm tabular-nums text-ink">
              {pressureUnit.fmt(pinPressure, 1)} {pressureUnit.chip(t('ejectionTool.pinPressure'))}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-ink-muted">{t('ejectionTool.pinCharge')}</span>
            <span className="text-sm tabular-nums text-ink">
              {pinMassUnit.fmt(pinCharge, 2)} {pinMassUnit.chip(t('ejectionTool.pinCharge'))}
            </span>
          </div>
          {short && <p className="text-xs text-warn-400">{t('ejectionTool.short')}</p>}
        </>
      )}
      <p className="text-[10px] text-ink-faint">{t('ejectionTool.estimate')}</p>
    </div>
  );
}
