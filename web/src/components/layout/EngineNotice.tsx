import { useTranslation } from 'react-i18next';
import { useEngineStore } from '../../state/engineStore';
import { fmtMb } from '../../i18n/format';
import { keyedText } from '../../i18n/keyedError';
import { Banner } from '../common/Banner';

export function EngineNotice() {
  const { t } = useTranslation();
  const phase = useEngineStore((s) => s.phase);
  const status = useEngineStore((s) => s.status);
  const slow = useEngineStore((s) => s.slow);
  const retry = useEngineStore((s) => s.retry);
  const reload = useEngineStore((s) => s.reload);
  const needsReload = useEngineStore((s) => s.needsReload);
  const error = useEngineStore((s) => s.error);

  if (phase === 'ready') return null;

  const stuck = phase === 'failed' || slow;

  const step = () => {
    if (!status) return t('boot.downloading');
    if (status.phase === 'starting') return t('boot.starting');
    if (status.total) return t('boot.downloadingOf', { done: fmtMb(status.loaded), total: fmtMb(status.total) });
    return status.loaded > 0 ? t('boot.downloaded', { done: fmtMb(status.loaded) }) : t('boot.downloading');
  };

  const headline = phase === 'failed' ? t('boot.failed') : stuck ? t('engine.slow') : step();
  // No byte count in the live text: a polite region repeats on every change.
  const spoken =
    phase === 'failed'
      ? t('boot.failed')
      : stuck
        ? `${t('engine.slow')} ${t('engine.needsIt')}`
        : status?.phase === 'starting'
          ? t('boot.starting')
          : t('boot.downloading');

  return (
    <Banner tone={stuck ? 'warn' : 'neutral'}>
      <span role="status" className="sr-only">
        {spoken}
      </span>
      <span className="font-medium" aria-hidden="true">
        {headline}
      </span>
      {stuck && (
        <span className="text-xs opacity-90" aria-hidden="true">
          {t('engine.needsIt')}
        </span>
      )}
      {phase === 'failed' && error && (
        <span className="w-full text-xs opacity-90">{typeof error === 'string' ? error : keyedText(error, t)}</span>
      )}
      {stuck && (
        <button
          type="button"
          onClick={needsReload ? reload : retry}
          className="ml-auto rounded-md bg-warn-500/15 px-2 py-1 text-xs font-medium text-warn-100 ring-1 ring-warn-400/30 hover:bg-warn-500/25"
        >
          {needsReload ? t('engine.reload') : t('engine.retry')}
        </button>
      )}
    </Banner>
  );
}
