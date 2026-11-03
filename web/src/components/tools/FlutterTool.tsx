import { rememberedSlot, useRemembered } from './remembered';
import { useTranslation } from 'react-i18next';
import { useUnits } from '../../prefs/useUnits';
import { flutterSpeed, flutterVerdict } from '../../services/flight/finFlutter';
import { QNum } from '../sim/QNum';
import { CardGroup } from '../common/CardGroup';
import { SiteElevationField } from './SiteFields';
import { FinStockFields, FlutterMarginRows, FlutterSpeedRow } from './FlutterFields';
import { stockModulus, type FinStock } from '../../state/finFlutterChoices';
import { ToolLayout, ToolForm, ToolResultCard } from './ToolLayout';

/**
 * Fin flutter with no design: a trapezoidal fin, its material and the fastest
 * point of the flight give the speed the fin flutters at there, and how far
 * the flight stays under it. A fin set in a design has the same estimate in
 * its editor, flown against its simulation (`FinFlutterReadout`).
 */

interface Remembered {
  rootM: number | null;
  tipM: number | null;
  spanM: number | null;
  thicknessM: number | null;
  material: FinStock;
  shearPa: number | null;
  speedMs: number | null;
  altitudeM: number | null;
  siteM: number | null;
}
const remembered = rememberedSlot<Remembered>();

/** Clears the remembered inputs, so each test starts from the defaults. */
export function forgetFlutterTool(): void {
  remembered.forget();
}

export function FlutterTool() {
  const { t } = useTranslation();
  const u = useUnits();
  const [rootM, setRootM] = useRemembered(remembered, 'rootM', null);
  const [tipM, setTipM] = useRemembered(remembered, 'tipM', null);
  const [spanM, setSpanM] = useRemembered(remembered, 'spanM', null);
  const [thicknessM, setThicknessM] = useRemembered(remembered, 'thicknessM', null);
  const [material, setMaterial] = useRemembered<Remembered, 'material'>(remembered, 'material', 'g10');
  const [shearPa, setShearPa] = useRemembered(remembered, 'shearPa', stockModulus('g10'));
  const [speedMs, setSpeedMs] = useRemembered(remembered, 'speedMs', null);
  const [altitudeM, setAltitudeM] = useRemembered(remembered, 'altitudeM', null);
  const [siteM, setSiteM] = useRemembered(remembered, 'siteM', 0);

  const flutter =
    rootM != null && spanM != null && thicknessM != null && shearPa != null
      ? flutterSpeed(
          { rootChordM: rootM, tipChordM: tipM ?? 0, spanM, thicknessM },
          shearPa,
          (siteM ?? 0) + (altitudeM ?? 0),
        )
      : null;
  const ratio = flutter && speedMs != null && speedMs > 0 ? flutter.speedMs / speedMs : null;

  return (
    <ToolLayout>
      <ToolForm title={t('flutterTool.title')} intro={t('flutterTool.intro')}>
        <CardGroup title={t('flutterTool.fin')}>
          <QNum
            label={t('flutterTool.root')}
            field="flutterRoot"
            kind="length"
            u={u}
            stepSi={0.001}
            minSi={0.001}
            maxSi={5}
            required
            missing={rootM == null}
            value={rootM}
            onChange={setRootM}
          />
          <QNum
            label={t('flutterTool.tip')}
            hint={t('flutterTool.tipHint')}
            field="flutterTip"
            kind="length"
            u={u}
            stepSi={0.001}
            minSi={0}
            maxSi={5}
            placeholder="0"
            value={tipM}
            onChange={setTipM}
          />
          <QNum
            label={t('flutterTool.span')}
            hint={t('flutterTool.spanHint')}
            field="flutterSpan"
            kind="length"
            u={u}
            stepSi={0.001}
            minSi={0.001}
            maxSi={5}
            required
            missing={spanM == null}
            value={spanM}
            onChange={setSpanM}
          />
          <QNum
            label={t('flutterTool.thickness')}
            field="flutterThickness"
            kind="length"
            u={u}
            stepSi={0.0001}
            minSi={0.0001}
            maxSi={0.1}
            required
            missing={thicknessM == null}
            value={thicknessM}
            onChange={setThicknessM}
          />
        </CardGroup>
        <CardGroup title={t('flutterTool.material')}>
          <FinStockFields
            stock={material}
            shearPa={shearPa}
            onChange={(stock, pa) => {
              setMaterial(stock);
              setShearPa(pa);
            }}
          />
        </CardGroup>
        <CardGroup title={t('flutterTool.flight')}>
          <QNum
            label={t('flutterTool.speed')}
            hint={t('flutterTool.speedHint')}
            field="flutterSpeed"
            kind="velocity"
            u={u}
            stepSi={1}
            minSi={1}
            maxSi={3000}
            required
            missing={speedMs == null}
            value={speedMs}
            onChange={setSpeedMs}
          />
          <QNum
            label={t('flutterTool.altitude')}
            hint={t('flutterTool.altitudeHint')}
            field="flutterAltitude"
            kind="distance"
            u={u}
            stepSi={10}
            minSi={0}
            maxSi={20000}
            placeholder="0"
            value={altitudeM}
            onChange={setAltitudeM}
          />
          <SiteElevationField required missing={siteM == null} value={siteM} onChange={setSiteM} />
        </CardGroup>
      </ToolForm>
      <ToolResultCard label={t('flutterTool.result')}>
        {flutter ? (
          <div className="space-y-2">
            <FlutterSpeedRow label={t('flutterTool.flutterSpeed')} speedMs={flutter.speedMs} mach={flutter.mach} />
            {ratio != null && <FlutterMarginRows ratio={ratio} verdict={flutterVerdict(ratio)} />}
            <p className="text-[10px] text-ink-faint">{t('flutterTool.estimate')}</p>
          </div>
        ) : (
          <p className="text-xs text-ink-muted">{t('flutterTool.empty')}</p>
        )}
      </ToolResultCard>
    </ToolLayout>
  );
}
