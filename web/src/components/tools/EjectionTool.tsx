import { useRemembered } from './remembered';
import { useTranslation } from 'react-i18next';
import { useUnits } from '../../prefs/useUnits';
import { blackPowderMass, DEFAULT_BAY_PRESSURE_PA, EJECTION_FIELD_LIMITS } from '../../services/flight/ejectionCharge';
import { QNum } from '../sim/QNum';
import { CardGroup } from '../common/CardGroup';
import { NumberRow } from '../common/NumberRow';
import { EjectionFigures } from './EjectionFigures';
import { ToolLayout, ToolForm, ToolResultCard } from './ToolLayout';
import { remembered } from './ejectionToolMemory';

export function EjectionTool() {
  const { t } = useTranslation();
  const u = useUnits();
  const [boreM, setBoreM] = useRemembered(remembered, 'boreM', null);
  const [lengthM, setLengthM] = useRemembered(remembered, 'lengthM', null);
  const [pressurePa, setPressurePa] = useRemembered(remembered, 'pressurePa', DEFAULT_BAY_PRESSURE_PA);
  const [pinCount, setPinCount] = useRemembered(remembered, 'pinCount', null);
  const [pinForceN, setPinForceN] = useRemembered(remembered, 'pinForceN', null);
  const ready =
    pressurePa != null && boreM != null && lengthM != null && blackPowderMass(pressurePa, boreM, lengthM) != null;

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
            {...EJECTION_FIELD_LIMITS.bore}
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
            {...EJECTION_FIELD_LIMITS.length}
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
            {...EJECTION_FIELD_LIMITS.pressure}
            required
            missing={pressurePa == null}
            value={pressurePa}
            onChange={setPressurePa}
          />
        </CardGroup>
        <CardGroup title={t('ejectionTool.pins')}>
          <NumberRow
            label={t('ejectionTool.pinCount')}
            {...EJECTION_FIELD_LIMITS.pinCount}
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
            {...EJECTION_FIELD_LIMITS.pinForce}
            value={pinForceN}
            onChange={setPinForceN}
          />
        </CardGroup>
      </ToolForm>
      <ToolResultCard label={t('ejectionTool.result')}>
        {ready ? (
          <EjectionFigures
            boreM={boreM}
            lengthM={lengthM}
            pressurePa={pressurePa}
            pinCount={pinCount}
            pinForceN={pinForceN}
          />
        ) : (
          <p className="text-xs text-ink-muted">{t('ejectionTool.empty')}</p>
        )}
      </ToolResultCard>
    </ToolLayout>
  );
}
