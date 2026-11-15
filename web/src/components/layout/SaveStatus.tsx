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

  // Mounted empty from the start and filled on the first save: a region created holding its text is
  // never announced. The text then stays the same, so later saves do not announce again.
  const saved = lastSavedAt !== null && !warning;

  return (
    <span
      role="status"
      title={saved ? t('save.tip', { time: fmtDateTime(lastSavedAt, { timeStyle: 'medium' }) }) : undefined}
      className="text-[10px] font-medium text-ink-faint"
    >
      {saved && (
        <>
          {/* No age in the live text, or it would re-announce every tick. */}
          <span aria-hidden="true">
            {withAge
              ? t('save.saved', { when: fmtRelativeAge(now - lastSavedAt, t('save.justNow')) })
              : t('save.savedShort')}
          </span>
          <span className="sr-only">{t('save.savedShort')}</span>
        </>
      )}
    </span>
  );
}
