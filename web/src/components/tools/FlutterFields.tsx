import { useTranslation } from 'react-i18next';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { fmtNum } from '../../i18n/format';
import { FIN_MATERIALS, FLUTTER_MARGIN, type FlutterVerdict } from '../../services/flight/finFlutter';
import { stockModulus, type FinStock } from '../../state/finFlutterChoices';
import { QNum } from '../sim/QNum';
import { FieldLabel } from '../common/FieldMark';
import { useScopedUnit } from '../common/useScopedUnit';

const FLUTTER_TONE: Record<FlutterVerdict, string> = {
  over: 'text-danger-400',
  marginal: 'text-warn-400',
  ok: 'text-ok-400',
};

export function FinStockFields({
  stock,
  shearPa,
  onChange,
  hint,
}: {
  stock: FinStock;
  shearPa: number | null;
  onChange: (stock: FinStock, shearPa: number | null) => void;
  hint?: string;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  return (
    <>
      <label className="flex items-center justify-between gap-3">
        <FieldLabel text={t('flutterTool.materialKind')} />
        <select
          value={stock}
          onChange={(e) => {
            const next = e.target.value as FinStock;
            onChange(next, next === 'custom' ? shearPa : stockModulus(next));
          }}
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
        hint={hint ?? t('flutterTool.shearHint')}
        field="flutterShear"
        kind="pressure"
        u={u}
        stepSi={1e7}
        minSi={1e6}
        maxSi={1e12}
        required
        missing={shearPa == null}
        value={shearPa}
        onChange={(v) => onChange('custom', v)}
      />
    </>
  );
}

function FlutterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

export function FlutterSpeedRow({ label, speedMs, mach }: { label: string; speedMs: number; mach: number }) {
  const { t } = useTranslation();
  const speedUnit = useScopedUnit(unitScope('flutter', 'speed'), 'velocity');
  return (
    <FlutterRow label={label}>
      <span className="text-sm tabular-nums text-ink">
        {speedUnit.fmt(speedMs, 0)} {speedUnit.chip(label)}{' '}
        <span className="text-ink-faint">{t('flutterTool.mach', { mach: fmtNum(mach, 2) })}</span>
      </span>
    </FlutterRow>
  );
}

export function FlutterMarginRows({ ratio, verdict }: { ratio: number; verdict: FlutterVerdict }) {
  const { t } = useTranslation();
  return (
    <>
      <FlutterRow label={t('flutterTool.margin')}>
        <span className={`text-sm font-semibold tabular-nums ${FLUTTER_TONE[verdict]}`}>
          {t('flutterTool.ratio', { ratio: fmtNum(ratio, 2) })}
        </span>
      </FlutterRow>
      <p className={`text-xs ${FLUTTER_TONE[verdict]}`}>
        {t(`flutterTool.verdict_${verdict}`, { margin: fmtNum(FLUTTER_MARGIN, 2) })}
      </p>
    </>
  );
}
