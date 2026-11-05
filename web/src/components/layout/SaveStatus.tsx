import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { useIsWide } from '../common/useMediaQuery';

const TICK_MS = 30_000;

export function SaveStatus() {
  const { t, i18n } = useTranslation();
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

  const mins = Math.floor(Math.max(0, now - lastSavedAt) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
  const when =
    mins < 1 ? t('save.justNow') : mins < 60 ? rtf.format(-mins, 'minute') : rtf.format(-Math.floor(mins / 60), 'hour');

  return (
    <span
      role="status"
      title={t('save.tip', {
        time: new Intl.DateTimeFormat(i18n.language, { timeStyle: 'medium' }).format(new Date(lastSavedAt)),
      })}
      className="text-[10px] font-medium text-ink-faint"
    >
      {/* No age in the live text, or it would re-announce every tick. */}
      <span aria-hidden="true">{withAge ? t('save.saved', { when }) : t('save.savedShort')}</span>
      <span className="sr-only">{t('save.savedShort')}</span>
    </span>
  );
}
