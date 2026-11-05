import { useTranslation } from 'react-i18next';

export function MotorSearch({
  value,
  onChange,
  className = '',
  autoFocus = true,
}: {
  value: string;
  onChange: (text: string) => void;
  className?: string;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoFocus={autoFocus}
      placeholder={t('motorDlg.searchCode')}
      aria-label={t('motorDlg.searchCode')}
      className={`flex-1 rounded-lg bg-canvas px-3 text-sm text-ink-strong ring-1 ring-line/10 placeholder:text-ink-faint focus:outline-none focus:ring-accent-500 ${className}`}
    />
  );
}

export function MotorHeading({
  kicker,
  impulseClass,
  title,
  designation,
}: {
  kicker: string;
  impulseClass: string;
  title: string;
  designation?: boolean;
}) {
  return (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-warn-300">{kicker}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="rounded bg-ok-500/15 px-1.5 py-0.5 text-xs font-semibold text-ok-300">{impulseClass}</span>
        <h3 className={`${designation ? 'font-data ' : ''}text-2xl font-bold text-ink-strong`}>{title}</h3>
      </div>
    </>
  );
}

export function NoCurveNote() {
  const { t } = useTranslation();
  return <p className="my-4 rounded-lg bg-raised/50 p-3 text-xs text-ink-muted">{t('motorDlg.noCurve')}</p>;
}
