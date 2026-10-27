import { rememberedSlot, useRemembered } from './remembered';
import { useTranslation } from 'react-i18next';
import { useUnits } from '../../prefs/useUnits';
import { siteAirDensity } from '../../services/flight/recoverySizing';
import { LAUNCH_SITE_LIMITS } from '../../services/storage/launchLocationStore';
import { QNum } from '../sim/LaunchPanel';
import { SizingFigures } from './SizingFigures';
import { CardGroup } from '../common/CardGroup';
import { LAUNCH_SI } from '../../prefs/launchUnits';
import { SiteElevationField } from './SiteFields';
import { NumberRow } from '../common/NumberRow';
import { ToolLayout, ToolForm, ToolResultCard } from './ToolLayout';

/**
 * Parachute sizing with no design: a descent mass, a canopy's Cd and the site's
 * air give the canopy for the main and drogue bands, or for a rate of your own.
 * The same figures the parachute editor's sizing dialog shows, from typed inputs.
 */

interface Remembered {
  massKg: number | null;
  cd: number | null;
  diameterM: number | null;
  siteM: number | null;
  temperatureC: number | null;
}
const remembered = rememberedSlot<Remembered>();

/** Clears the remembered inputs, so each test starts from the defaults. */
export function forgetParachuteTool(): void {
  remembered.forget();
}

export function ParachuteTool() {
  const { t } = useTranslation();
  const u = useUnits();
  const [massKg, setMassKg] = useRemembered(remembered, 'massKg', 0.5);
  const [cd, setCd] = useRemembered(remembered, 'cd', 0.8);
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
            step={0.05}
            min={0.05}
            max={3}
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
            stepSi={0.01}
            minSi={0.01}
            maxSi={20}
            placeholder={t('chuteTool.none')}
            value={diameterM}
            onChange={setDiameterM}
          />
        </CardGroup>
        <CardGroup title={t('chuteTool.air')}>
          <SiteElevationField required missing={siteM == null} value={siteM} onChange={setSiteM} />
          <QNum
            label={t('launch.temperature')}
            field="chuteTemperature"
            kind="degC"
            u={u}
            stepSi={1}
            minSi={LAUNCH_SI.degC.toSi(LAUNCH_SITE_LIMITS.temperatureC.min)}
            maxSi={LAUNCH_SI.degC.toSi(LAUNCH_SITE_LIMITS.temperatureC.max)}
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
