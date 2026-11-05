import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { APP_VERSION } from '../../services/app/appInfo';
import { useUpdateStore } from '../../state/updateStore';
import { fireAction } from '../../state/fireAction';
import { Dialog } from '../common/Dialog';
import { DialogButton, DialogActions } from '../common/DialogButton';
import { useLatest } from '../common/useLatest';

export function UpdateCheckDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const stored = useUpdateStore((s) => s.result);
  const checkNow = useUpdateStore((s) => s.checkNow);
  // The store keeps the last answer between openings; show "checking" until this one finishes.
  const [answered, setAnswered] = useState(false);
  const result = answered ? stored : 'checking';

  // `observe` is stable; the object `useLatest` returns is not.
  const { observe } = useLatest();
  useEffect(() => {
    const live = observe();
    fireAction(
      checkNow().then(() => {
        if (live()) setAnswered(true);
      }),
    );
  }, [checkNow, observe]);

  const message: Record<typeof result, string> = {
    idle: t('update.checking'),
    checking: t('update.checking'),
    upToDate: t('update.upToDate'),
    available: t('update.foundNew'),
    failed: t('update.checkFailed'),
  };
  return (
    <Dialog id="updateCheck" title={t('update.check')} onClose={onClose} layout="pad" size="sm" expandable={false}>
      <p className="text-xs text-ink-muted">{t('update.running', { version: APP_VERSION })}</p>
      <p
        role="status"
        aria-live="polite"
        className={`mt-2 text-sm ${result === 'failed' ? 'text-warn-300' : 'text-ink-soft'}`}
      >
        {message[result]}
      </p>
      <DialogActions>
        <DialogButton onClick={onClose} variant="primary">
          {t('common.close')}
        </DialogButton>
      </DialogActions>
    </Dialog>
  );
}
