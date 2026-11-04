import { useTranslation } from 'react-i18next';

const box = (missing?: boolean, mixed?: boolean): string =>
  missing
    ? 'rounded bg-danger-500/20 px-1.5 py-0.5 text-danger-200 ring-1 ring-danger-500/60'
    : mixed
      ? 'rounded bg-warn-500/20 px-1.5 py-0.5 text-warn-200 ring-1 ring-warn-500/50'
      : '';

export function FieldLabel({
  text,
  required,
  missing,
  mixed,
  className = 'text-xs text-ink-muted',
}: {
  text: string;
  required?: boolean;
  missing?: boolean;
  mixed?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const why = missing
    ? mixed
      ? `${t('sims.missingField')} ${t('sims.mixedField')}`
      : t('sims.missingField')
    : mixed
      ? t('sims.mixedField')
      : required
        ? t('sims.requiredField')
        : '';
  const flagged = box(missing, mixed);
  return (
    <span className={`${className} ${flagged}`} title={why || undefined}>
      {text}
      {required && !missing && (
        <span className="ml-0.5 align-super text-[10px] leading-none text-danger-400/80" aria-hidden>
          *
        </span>
      )}
      {why && <span className="sr-only"> {why}</span>}
    </span>
  );
}

/** Replaces rather than appends: two `ring-*` utilities resolve by stylesheet order, not string order. */
export const markRing = (cls: string, missing?: boolean, mixed?: boolean): string =>
  missing
    ? cls.replace('ring-line/10', 'ring-danger-500/70')
    : mixed
      ? cls.replace('ring-line/10', 'ring-warn-500/60')
      : cls;
