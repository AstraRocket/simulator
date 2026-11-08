import { useTranslation } from 'react-i18next';
import type { StaticInfo } from '../../engine/api';
import { stabilityState, stabilityToneOf } from '../../services/flight/simReport';
import { useUnits } from '../../prefs/useUnits';
import { marginText } from '../../tree/schematicGeometry';
import { NO_VALUE } from '../../i18n/noValue';

export function InfoOverlay({ info }: { info: StaticInfo | null }) {
  const { t } = useTranslation();
  const u = useUnits();
  if (!info) return null;
  const cal = info.stabilityCalibers;
  const state = stabilityState(cal);
  // The engine's own percent of aerodynamic length (StaticInfo.stabilityPercent), not ours.
  const pct = info.stabilityPercent;
  const margin = marginText(cal, pct, t);
  const rows: [string, React.ReactNode][] = [
    [t('stats.length'), `${u.fmtSym('length', info.length)}`],
    [t('stability.mass'), `${u.fmtSym('mass', info.mass)}`],
    [t('stability.cg'), `${u.fmtSym('length', info.cg)}`],
    [t('stability.cp'), `${u.fmtSym('length', info.cp)}`],
    [
      t('stability.onPad'),
      <span className={state ? stabilityToneOf(state) : 'text-ink-muted'}>
        {margin ? `${margin.glyph} ${margin.figures}` : NO_VALUE}
      </span>,
    ],
  ];
  return (
    <div className="pointer-events-none rounded-lg bg-surface/85 px-3 py-2 ring-1 ring-line/10">
      <table className="border-separate border-spacing-x-3 border-spacing-y-0.5">
        <tbody>
          {rows.map(([label, value], i) => (
            <tr key={i}>
              <td className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</td>
              <td className="text-right text-xs font-semibold tabular-nums text-ink-strong">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
