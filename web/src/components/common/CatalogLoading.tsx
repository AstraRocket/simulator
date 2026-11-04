import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type CatalogProgress, progressPercent, subscribeCatalogProgress } from '../../services/app/remoteData';
import { fmtMb } from '../../i18n/format';

export function useCatalogProgress(name: string): CatalogProgress | null {
  const [progress, setProgress] = useState<CatalogProgress | null>(null);
  useEffect(() => subscribeCatalogProgress(name, setProgress), [name]);
  return progress;
}

export function CatalogLoading({ name, label }: { name: string; label: string }) {
  const { t } = useTranslation();
  const progress = useCatalogProgress(name);
  const pct = progressPercent(progress);
  const bytes =
    !progress || progress.loaded === 0
      ? null
      : progress.total
        ? t('catalog.loadingOf', { done: fmtMb(progress.loaded), total: fmtMb(progress.total) })
        : t('catalog.loadedSoFar', { done: fmtMb(progress.loaded) });

  return (
    <div className="space-y-3 px-3 py-6 text-center text-base text-ink-soft">
      <p>
        {label}
        {bytes && <span className="ml-1.5 tabular-nums text-ink-muted">{bytes}</span>}
      </p>
      <div
        className="mx-auto h-2 w-[min(20rem,72vw)] overflow-hidden rounded-full bg-elevated/60"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        // Omitted while indeterminate, so assistive tech announces "busy".
        aria-valuenow={pct ?? undefined}
      >
        <div
          className={`h-full rounded-full bg-accent-500 transition-[width] duration-150 ${pct == null ? 'animate-pulse' : ''}`}
          style={{ width: pct == null ? '100%' : `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function CatalogError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 px-3 py-6 text-center text-base">
      <p role="alert" className="text-warn-300">
        {message}
      </p>
      <button onClick={onRetry} className="rounded-lg bg-elevated px-4 py-2 text-ink-strong hover:bg-prominent">
        {t('catalog.retry')}
      </button>
    </div>
  );
}
