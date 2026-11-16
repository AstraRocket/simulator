import { useRemembered } from './remembered';
import { useTranslation } from 'react-i18next';
import { useUnits } from '../../prefs/useUnits';
import { CHUTE_LIMITS, siteAirDensity } from '../../services/flight/recoverySizing';
import { QNum } from '../sim/QNum';
import { SizingFigures } from './SizingFigures';
import { CardGroup } from '../common/CardGroup';
import { SiteElevationField, SiteTemperatureField } from '../sim/SiteQNum';
import { NumberRow } from '../common/NumberRow';
import { ToolLayout, ToolForm, ToolResultCard } from './ToolLayout';
import { remembered } from './parachuteToolMemory';
import { KERNEL_DEFAULTS } from '../../tree/kernelDefaults';

export function ParachuteTool() {
  const { t } = useTranslation();
  const u = useUnits();
  const [massKg, setMassKg] = useRemembered(remembered, 'massKg', 0.5);
  const [cd, setCd] = useRemembered(remembered, 'cd', KERNEL_DEFAULTS.parachute.cd);
  const [diameterM, setDiameterM] = useRemembered(remembered, 'diameterM', null);
  const [siteM, setSiteM] = useRemembered(remembered, 'siteM', 0);
  const [temperatureC, setTemperatureC] = useRemembered(remembered, 'temperatureC', null);

  const rho = siteAirDensity(siteM, temperatureC);
  const ready = massKg != null && massKg > 0 && cd != null && cd > 0;

  return (
    <ToolLayout>
      <ToolForm title={t('chuteTool.title')} intro={t('chuteTool.intro')}>
        <CardGroup title={t('chuteTool.rocket')}>
          <QNum
            label={t('chuteTool.mass')}
            hint={t('chuteTool.massHint')}
            field="chuteMass"
            kind="mass"
            u={u}
            stepSi={0.01}
            minSi={0.001}
            maxSi={1000}
            required
            missing={massKg == null}
            value={massKg}
            onChange={setMassKg}
          />
          <NumberRow
            label={t('chuteTool.cd')}
            {...CHUTE_LIMITS.cd}
            required
            missing={cd == null}
            value={cd}
            onChange={setCd}
          />
          <QNum
            label={t('chuteTool.diameter')}
            field="chuteDiameter"
            kind="length"
            u={u}
            {...CHUTE_LIMITS.diameter}
            placeholder={t('chuteTool.none')}
            value={diameterM}
            onChange={setDiameterM}
          />
        </CardGroup>
        <CardGroup title={t('chuteTool.air')}>
          <SiteElevationField required missing={siteM == null} value={siteM} onChange={setSiteM} />
          <SiteTemperatureField
            field="chuteTemperature"
            placeholder={t('chuteTool.standard')}
            value={temperatureC}
            onChange={setTemperatureC}
          />
        </CardGroup>
      </ToolForm>
      <ToolResultCard label={t('chuteTool.result')}>
        {ready ? (
          <SizingFigures massKg={massKg} cd={cd} rho={rho} diameterM={diameterM} />
        ) : (
          <p className="text-xs text-ink-muted">{t('chuteTool.empty')}</p>
        )}
      </ToolResultCard>
    </ToolLayout>
  );
}
