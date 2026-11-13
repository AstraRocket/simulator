import { useTranslation } from 'react-i18next';
import { fmtNum, fmtSig } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import type { StaticInfo } from '../../engine/api';
import { stabilityState, stabilityToneOf, stabilityVerdictKey } from '../../services/flight/simReport';
import { Stat } from '../common/Stat';
import { Disclosure } from '../common/Disclosure';
import { useScopedUnit } from '../common/useScopedUnit';
import { unitScope } from '../../prefs/units';
import { useSettings } from '../../state/useSettings';
import { stabilityReadout } from '../layout/simSummaryReadouts';

export function StabilityBadge({
  info,
  recoveryWeight,
  recoveryEstimated,
  expanded,
  onToggle,
}: {
  info: StaticInfo | null;
  recoveryWeight?: number; // kg
  recoveryEstimated?: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const compact = useSettings().settings.statsLayout === 'compact';
  const tile = compact ? { inline: true } : { card: true, dense: true };
  const lengthTile = useScopedUnit(unitScope('stats', 'length'), 'length');
  const diameterTile = useScopedUnit(unitScope('stats', 'maxDiameter'), 'length');
  const massTile = useScopedUnit(unitScope('stats', 'mass'), 'mass');
  const recoveryTile = useScopedUnit(unitScope('stats', 'recoveryWeight'), 'mass');
  const cgTile = useScopedUnit(unitScope('stats', 'cg'), 'length');
  const cpTile = useScopedUnit(unitScope('stats', 'cp'), 'length');
  if (!info) return null;
  const cal = info.stabilityCalibers;
  // An uncomputable margin has no band: neutral, not a false "Unstable".
  const padState = stabilityState(cal);
  const padTone = padState ? stabilityToneOf(padState) : 'text-ink-muted';
  const pct = info.stabilityPercent;
  // Significant figures: inertias span orders of magnitude.
  const fmtInertia = (v: number) => fmtSig(v, 4);
  return (
    <div className="@container mx-3 mb-3 mt-3">
      <Disclosure
        as={null}
        open={expanded}
        onToggle={onToggle}
        title={t('stats.title')}
        label={t('stats.title')}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-ink-soft hover:bg-raised/60"
        labelClassName="text-[10px] font-semibold uppercase tracking-wide text-ink-muted"
        glyphClassName="w-3 shrink-0 text-[10px] leading-none text-ink-muted"
        after={
          !expanded && (
            <span className="ml-auto truncate text-[11px] tabular-nums text-ink-muted">
              {lengthTile.fmt(info.length)} {lengthTile.sym} · {stabilityReadout(cal, t)}
            </span>
          )
        }
      />
      {expanded && (
        <div
          className={`mt-2 grid grid-cols-2 gap-1.5 ${
            compact ? '@md:grid-cols-3 @2xl:grid-cols-4 @3xl:grid-cols-6' : '@xl:grid-cols-3 @6xl:grid-cols-6'
          }`}
        >
          <Stat
            {...tile}
            label={t('stats.length')}
            value={lengthTile.fmt(info.length)}
            sub={lengthTile.chip(t('stats.length'))}
          />
          <Stat
            {...tile}
            label={t('stats.maxDiameter')}
            value={diameterTile.fmt(info.refDiameter)}
            sub={diameterTile.chip(t('stats.maxDiameter'))}
          />
          <Stat
            {...tile}
            label={t('stability.mass')}
            value={`${massTile.fmt(info.massEmpty)} / ${massTile.fmt(info.mass)}`}
            sub={massTile.chip(t('stability.mass'))}
            note={t('stats.emptyLoaded')}
          />
          <Stat
            {...tile}
            label={recoveryEstimated ? t('stats.recoveryWeightEstimated') : t('stats.recoveryWeight')}
            value={recoveryWeight != null ? recoveryTile.fmt(recoveryWeight) : NO_VALUE}
            sub={recoveryWeight != null ? recoveryTile.chip(t('stats.recoveryWeight')) : t('stats.needsMotor')}
          />
          <Stat
            {...tile}
            label={t('stability.cg')}
            value={`${cgTile.fmt(info.cgEmpty)} / ${cgTile.fmt(info.cg)}`}
            sub={cgTile.chip(t('stability.cg'))}
            note={t('stats.emptyLoaded')}
          />
          <Stat {...tile} label={t('stability.cp')} value={cpTile.fmt(info.cp)} sub={cpTile.chip(t('stability.cp'))} />
          <Stat
            {...tile}
            label={t('stats.fineness')}
            value={info.refDiameter > 0 ? fmtNum(info.length / info.refDiameter, 1) : NO_VALUE}
            sub="L/D"
          />
          <Stat
            {...tile}
            label={t('stability.onPad')}
            value={`${fmtNum(cal, 2)} / ${fmtNum(pct, 1)}`}
            sub={`${t('stability.caliber')} / %`}
            status={padState ? t(stabilityVerdictKey(cal)) : undefined}
            tone={padTone}
          />
          <Stat {...tile} label={t('stats.cd')} value={info.cd != null ? fmtNum(info.cd, 3) : NO_VALUE} sub="Ma 0.3" />
          {/* Symbol in the sub: the uppercased label would turn α into Α. */}
          <Stat {...tile} label={t('stats.cna')} value={fmtNum(info.cna, 2)} sub="CNα · rad⁻¹" />
          <Stat {...tile} label={t('stats.pitchInertia')} value={fmtInertia(info.pitchInertia)} sub="kg·m²" />
          <Stat {...tile} label={t('stats.rollInertia')} value={fmtInertia(info.rollInertia)} sub="kg·m²" />
        </div>
      )}
    </div>
  );
}
