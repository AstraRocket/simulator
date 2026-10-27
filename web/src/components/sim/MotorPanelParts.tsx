import { useTranslation } from 'react-i18next';
import { catalogInfo } from '../../services/app/remoteData';
import { useAsyncLoad } from '../common/useAsyncLoad';

/**
 * Pieces the motor picker and the motor dashboard share, so the two read as
 * one catalog: the code search, the catalog's manifest, a motor's heading and
 * the note for a motor with no thrust curve.
 */

/** The published motor catalog's manifest (its size and date), or undefined until it loads or when it says nothing. */
export function useCatalogInfo() {
  return useAsyncLoad(() => catalogInfo('motors'), 'motorsInfo').data;
}

/** The search by motor code. `className` sizes it within its row. */
export function MotorSearch({
  value,
  onChange,
  className = '',
}: {
  value: string;
  onChange: (text: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoFocus
      placeholder={t('motorDlg.searchCode')}
      aria-label={t('motorDlg.searchCode')}
      className={`flex-1 rounded-lg bg-canvas px-3 text-sm text-ink-strong ring-1 ring-line/10 placeholder:text-ink-faint focus:outline-none focus:ring-accent-500 ${className}`}
    />
  );
}

/** A motor's (or a cluster's) heading: who makes it over its class and name. */
export function MotorHeading({ kicker, impulseClass, title }: { kicker: string; impulseClass: string; title: string }) {
  return (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-warn-300">{kicker}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="rounded bg-ok-500/15 px-1.5 py-0.5 text-xs font-semibold text-ok-300">{impulseClass}</span>
        <h3 className="text-2xl font-bold text-ink-strong">{title}</h3>
      </div>
    </>
  );
}

/** In place of a chart, for a motor the catalog has no thrust curve for. */
export function NoCurveNote() {
  const { t } = useTranslation();
  return <p className="my-4 rounded-lg bg-raised/50 p-3 text-xs text-ink-muted">{t('motorDlg.noCurve')}</p>;
}
