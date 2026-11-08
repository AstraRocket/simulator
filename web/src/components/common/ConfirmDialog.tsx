import { useTranslation } from 'react-i18next';
import { useConfirmStore } from '../../state/confirmStore';
import { AlertDialog } from './AlertDialog';

/** Mounts only with a request: the focus trap's `[active]` effect would never rerun on a permanent panel. */
export function ConfirmDialog() {
  const request = useConfirmStore((s) => s.request);
  const settle = useConfirmStore((s) => s.settle);
  const { t } = useTranslation();

  if (!request) return null;
  const { title, message, confirmLabel, cancelLabel, danger } = request;
  return (
    <AlertDialog
      title={title ?? t('common.confirmTitle')}
      message={message}
      danger={danger}
      confirmLabel={confirmLabel ?? t('common.confirm')}
      onConfirm={() => settle(true)}
      cancelLabel={cancelLabel}
      onCancel={() => settle(false)}
    />
  );
}
