import { useEffect, useState } from 'react';
import { fmtDateTime, fmtRelativeAge } from '../../i18n/format';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { useIsWide } from '../common/useMediaQuery';

const TICK_MS = 30_000;

export function SaveStatus() {
  const { t } = useTranslation();
  const lastSavedAt = useWorkspaceStore((s) => s.lastSavedAt);
  const withAge = useIsWide();
  const warning = useWorkspaceStore((s) => s.storageWarning);

  // A save can land before the next tick, so the clamp below reads negative age as zero.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (lastSavedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [lastSavedAt]);

  if (lastSavedAt === null || warning) return null;

  const when = fmtRelativeAge(now - lastSavedAt, t('save.justNow'));

  return (
    <span
      role="status"
      title={t('save.tip', {
        time: fmtDateTime(lastSavedAt, { timeStyle: 'medium' }),
      })}
      className="text-[10px] font-medium text-ink-faint"
    >
      {/* No age in the live text, or it would re-announce every tick. */}
      <span aria-hidden="true">{withAge ? t('save.saved', { when }) : t('save.savedShort')}</span>
      <span className="sr-only">{t('save.savedShort')}</span>
    </span>
  );
}
