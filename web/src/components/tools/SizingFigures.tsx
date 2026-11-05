import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtNum, fmtUpTo, withUnit } from '../../i18n/format';
import { useScopedUnit } from '../common/useScopedUnit';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { QNum } from '../sim/QNum';
import {
  canopyDiameter,
  canopyRoundUp,
  classifyRate,
  descentRate,
  DROGUE_BAND,
  MAIN_BAND,
  type RateVerdict,
} from '../../services/flight/recoverySizing';
import { smallButton } from '../common/smallButton';

const VERDICT_TONE: Record<RateVerdict, string> = {
  slow: 'text-warn-400',
  main: 'text-ok-400',
  between: 'text-warn-400',
  drogue: 'text-ok-400',
  fast: 'text-warn-400',
};

const useBtn = smallButton('tight', 'soft');

export function SizingFigures({
  massKg,
  cd,
  rho,
  diameterM,
  rateMs,
  onUse,
}: {
  massKg: number;
  cd: number;
  /** kg/m³ */
  rho: number;
  diameterM: number | null;
  rateMs?: number | null;
  onUse?: (diameterM: number) => void;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const rateUnit = useScopedUnit(unitScope('recovery', 'rate'), 'velocity');
  const mainUnit = useScopedUnit(unitScope('recovery', 'mainD'), 'length');
  const drogueUnit = useScopedUnit(unitScope('recovery', 'drogueD'), 'length');
  const targetUnit = useScopedUnit(unitScope('recovery', 'targetD'), 'length');
  const [target, setTarget] = useState<number | null>(null);

  // Bands are authored in ft/s, so one decimal with trailing zeros dropped reads cleanly in both.
  const rateBand = (minSi: number, maxSi: number) =>
    withUnit(`${fmtUpTo(rateUnit.toUi(minSi), 1)}–${fmtUpTo(rateUnit.toUi(maxSi), 1)}`, rateUnit.sym);

  const rate = rateMs ?? (diameterM != null && diameterM > 0 ? descentRate(massKg, diameterM, cd, rho) : null);
  const verdict = rate != null && Number.isFinite(rate) ? classifyRate(rate) : null;
  const mainD = canopyRoundUp(canopyDiameter(massKg, MAIN_BAND.target, cd, rho), mainUnit.sym);
  const drogueD = canopyRoundUp(canopyDiameter(massKg, DROGUE_BAND.target, cd, rho), drogueUnit.sym);
  const targetD =
    target != null && target > 0 ? canopyRoundUp(canopyDiameter(massKg, target, cd, rho), targetUnit.sym) : null;

  const row = (label: string, d: number, unit: typeof mainUnit, useLabel: string) => (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="flex items-baseline gap-2 text-sm tabular-nums text-ink">
        <span>
          Ø {unit.fmt(d)} {unit.chip(label)}
        </span>
        {onUse && Number.isFinite(d) && (
          <button type="button" className={useBtn} aria-label={useLabel} onClick={() => onUse(d)}>
            {t('recovery.use')}
          </button>
        )}
      </span>
    </div>
  );

  return (
    <div className="space-y-2">
      {rate != null && verdict != null && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-ink-muted">{t('recovery.thisChute')}</span>
          <span className="text-sm tabular-nums">
            <span className={VERDICT_TONE[verdict]}>{rateUnit.fmt(rate, 1)}</span>{' '}
            {rateUnit.chip(t('recovery.thisChute'))}{' '}
            <span className="text-ink-faint">({t(`recovery.verdict.${verdict}`)})</span>
          </span>
        </div>
      )}
      {row(
        t('recovery.mainTarget', { range: rateBand(MAIN_BAND.min, MAIN_BAND.max) }),
        mainD,
        mainUnit,
        t('recovery.useMain'),
      )}
      {row(
        t('recovery.drogueTarget', { range: rateBand(DROGUE_BAND.min, DROGUE_BAND.max) }),
        drogueD,
        drogueUnit,
        t('recovery.useDrogue'),
      )}
      <QNum
        label={t('recovery.targetRate')}
        field="recoveryTargetRate"
        kind="velocity"
        u={u}
        stepSi={0.5}
        minSi={0.5}
        maxSi={100}
        value={target}
        onChange={setTarget}
      />
      {targetD != null && row(t('recovery.atTarget'), targetD, targetUnit, t('recovery.useTarget'))}
      <p className="text-[10px] text-ink-faint">
        {t('recovery.atCd', { cd: fmtNum(cd, 2) })} {t('recovery.diametersEstimated')}
      </p>
    </div>
  );
}
