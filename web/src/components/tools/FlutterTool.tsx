import { rememberedSlot, useRemembered } from './remembered';
import { useTranslation } from 'react-i18next';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { fmtNum } from '../../i18n/format';
import {
  FIN_MATERIALS,
  flutterSpeed,
  flutterVerdict,
  FLUTTER_MARGIN,
  type FinMaterialKey,
  type FlutterVerdict,
} from '../../services/flight/finFlutter';
import { QNum } from '../sim/LaunchPanel';
import { CardGroup } from '../common/CardGroup';
import { FieldLabel } from '../common/FieldMark';
import { useScopedUnit } from '../common/UnitChip';
import { SiteElevationField } from './SiteFields';
import { ToolLayout, ToolForm, ToolResultCard } from './ToolLayout';

/**
 * Fin flutter with no design: a trapezoidal fin, its material and the fastest
 * point of the flight give the speed the fin flutters at there, and how far
 * the flight stays under it.
 */

interface Remembered {
  rootM: number | null;
  tipM: number | null;
  spanM: number | null;
  thicknessM: number | null;
  material: FinMaterialKey | 'custom';
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

const VERDICT_TONE: Record<FlutterVerdict, string> = {
  over: 'text-danger-400',
  marginal: 'text-warn-400',
  ok: 'text-ok-400',
};

const modulusOf = (key: FinMaterialKey) => FIN_MATERIALS.find((m) => m.key === key)!.shearModulusPa;

export function FlutterTool() {
  const { t } = useTranslation();
  const u = useUnits();
  const [rootM, setRootM] = useRemembered(remembered, 'rootM', null);
  const [tipM, setTipM] = useRemembered(remembered, 'tipM', null);
  const [spanM, setSpanM] = useRemembered(remembered, 'spanM', null);
  const [thicknessM, setThicknessM] = useRemembered(remembered, 'thicknessM', null);
  const [material, setMaterial] = useRemembered<Remembered, 'material'>(remembered, 'material', 'g10');
  const [shearPa, setShearPa] = useRemembered(remembered, 'shearPa', modulusOf('g10'));
  const [speedMs, setSpeedMs] = useRemembered(remembered, 'speedMs', null);
  const [altitudeM, setAltitudeM] = useRemembered(remembered, 'altitudeM', null);
  const [siteM, setSiteM] = useRemembered(remembered, 'siteM', 0);
  const speedUnit = useScopedUnit(unitScope('flutter', 'speed'), 'velocity');

  const flutter =
    rootM != null && spanM != null && thicknessM != null && shearPa != null
      ? flutterSpeed(
          { rootChordM: rootM, tipChordM: tipM ?? 0, spanM, thicknessM },
          shearPa,
          (siteM ?? 0) + (altitudeM ?? 0),
        )
      : null;
  const ratio = flutter && speedMs != null && speedMs > 0 ? flutter.speedMs / speedMs : null;
  const verdict = ratio != null ? flutterVerdict(ratio) : null;

  const pickMaterial = (key: FinMaterialKey | 'custom') => {
    setMaterial(key);
    if (key !== 'custom') setShearPa(modulusOf(key));
  };

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
          <label className="flex items-center justify-between gap-3">
            <FieldLabel text={t('flutterTool.materialKind')} />
            <select
              value={material}
              onChange={(e) => pickMaterial(e.target.value as FinMaterialKey | 'custom')}
              className="w-40 rounded-md bg-raised px-2 py-1 text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
            >
              {FIN_MATERIALS.map((m) => (
                <option key={m.key} value={m.key}>
                  {t(`flutterTool.material_${m.key}`)}
                </option>
              ))}
              <option value="custom">{t('flutterTool.material_custom')}</option>
            </select>
          </label>
          <QNum
            label={t('flutterTool.shear')}
            hint={t('flutterTool.shearHint')}
            field="flutterShear"
            kind="pressure"
            u={u}
            stepSi={1e7}
            minSi={1e6}
            maxSi={1e12}
            required
            missing={shearPa == null}
            value={shearPa}
            onChange={(v) => {
              setShearPa(v);
              setMaterial('custom');
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
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-ink-muted">{t('flutterTool.flutterSpeed')}</span>
              <span className="text-sm tabular-nums text-ink">
                {speedUnit.fmt(flutter.speedMs, 0)} {speedUnit.chip(t('flutterTool.flutterSpeed'))}{' '}
                <span className="text-ink-faint">{t('flutterTool.mach', { mach: fmtNum(flutter.mach, 2) })}</span>
              </span>
            </div>
            {ratio != null && verdict != null && (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-ink-muted">{t('flutterTool.margin')}</span>
                  <span className={`text-sm font-semibold tabular-nums ${VERDICT_TONE[verdict]}`}>
                    {t('flutterTool.ratio', { ratio: fmtNum(ratio, 2) })}
                  </span>
                </div>
                <p className={`text-xs ${VERDICT_TONE[verdict]}`}>
                  {t(`flutterTool.verdict_${verdict}`, { margin: fmtNum(FLUTTER_MARGIN, 2) })}
                </p>
              </>
            )}
            <p className="text-[10px] text-ink-faint">{t('flutterTool.estimate')}</p>
          </div>
        ) : (
          <p className="text-xs text-ink-muted">{t('flutterTool.empty')}</p>
        )}
      </ToolResultCard>
    </ToolLayout>
  );
}
