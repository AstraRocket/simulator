import { rememberedSlot, useRemembered } from './remembered';
import { useTranslation } from 'react-i18next';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { blackPowderMass, DEFAULT_BAY_PRESSURE_PA, pinShearPressure } from '../../services/flight/ejectionCharge';
import { QNum } from '../sim/LaunchPanel';
import { CardGroup } from '../common/CardGroup';
import { NumberRow } from '../common/NumberRow';
import { useScopedUnit } from '../common/UnitChip';
import { ToolLayout, ToolForm, ToolResultCard } from './ToolLayout';

/**
 * Ejection charge sizing with no design: a recovery bay's bore and length and
 * the pressure to reach give the black powder for it, and with shear pins, the
 * pressure that breaks them and the powder that reaches it.
 */

interface Remembered {
  boreM: number | null;
  lengthM: number | null;
  pressurePa: number | null;
  pinCount: number | null;
  pinForceN: number | null;
}
const remembered = rememberedSlot<Remembered>();

/** Clears the remembered inputs, so each test starts from the defaults. */
export function forgetEjectionTool(): void {
  remembered.forget();
}

export function EjectionTool() {
  const { t } = useTranslation();
  const u = useUnits();
  const [boreM, setBoreM] = useRemembered(remembered, 'boreM', null);
  const [lengthM, setLengthM] = useRemembered(remembered, 'lengthM', null);
  const [pressurePa, setPressurePa] = useRemembered(remembered, 'pressurePa', DEFAULT_BAY_PRESSURE_PA);
  const [pinCount, setPinCount] = useRemembered(remembered, 'pinCount', null);
  const [pinForceN, setPinForceN] = useRemembered(remembered, 'pinForceN', null);
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

  return (
    <ToolLayout>
      <ToolForm title={t('ejectionTool.title')} intro={t('ejectionTool.intro')}>
        <CardGroup title={t('ejectionTool.bay')}>
          <QNum
            label={t('ejectionTool.bore')}
            hint={t('ejectionTool.boreHint')}
            field="ejectionBore"
            kind="length"
            u={u}
            stepSi={0.001}
            minSi={0.005}
            maxSi={1}
            required
            missing={boreM == null}
            value={boreM}
            onChange={setBoreM}
          />
          <QNum
            label={t('ejectionTool.length')}
            hint={t('ejectionTool.lengthHint')}
            field="ejectionLength"
            kind="length"
            u={u}
            stepSi={0.001}
            minSi={0.005}
            maxSi={5}
            required
            missing={lengthM == null}
            value={lengthM}
            onChange={setLengthM}
          />
          <QNum
            label={t('ejectionTool.pressure')}
            hint={t('ejectionTool.pressureHint')}
            field="ejectionPressure"
            kind="pressure"
            u={u}
            stepSi={1000}
            minSi={1000}
            maxSi={1e6}
            required
            missing={pressurePa == null}
            value={pressurePa}
            onChange={setPressurePa}
          />
        </CardGroup>
        <CardGroup title={t('ejectionTool.pins')}>
          <NumberRow
            label={t('ejectionTool.pinCount')}
            step={1}
            min={0}
            max={24}
            placeholder={t('ejectionTool.none')}
            value={pinCount}
            onChange={(v) => setPinCount(v == null ? null : Math.round(v))}
          />
          <QNum
            label={t('ejectionTool.pinForce')}
            hint={t('ejectionTool.pinForceHint')}
            field="ejectionPinForce"
            kind="force"
            u={u}
            stepSi={1}
            minSi={1}
            maxSi={10000}
            value={pinForceN}
            onChange={setPinForceN}
          />
        </CardGroup>
      </ToolForm>
      <ToolResultCard label={t('ejectionTool.result')}>
        {charge != null ? (
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
        ) : (
          <p className="text-xs text-ink-muted">{t('ejectionTool.empty')}</p>
        )}
      </ToolResultCard>
    </ToolLayout>
  );
}
