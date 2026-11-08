import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from './useFocusTrap';
import { useBackdropDismiss } from './useBackdropDismiss';
import { layerClass, widthClass, type DialogLayer, type DialogSize } from './dialogSize';
import { DialogButton, DialogActions } from './DialogButton';

/** Deliberately no `.dialog-panel`: it opens over full-screen dialogs and must read as raised over them. */
export function AlertDialog({
  title,
  message,
  icon,
  size = 'sm',
  layer = 'top',
  danger,
  confirmLabel,
  onConfirm,
  cancelLabel,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  icon?: string;
  size?: DialogSize;
  layer?: DialogLayer;
  danger?: boolean;
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel?: string;
  /** Omitted, the prompt must be acknowledged: Escape and the backdrop do nothing. */
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const panelRef = useFocusTrap<HTMLDivElement>(true, onCancel ? { onEscape: onCancel } : {});
  const backdrop = useBackdropDismiss(onCancel);
  const titleId = useId();
  const messageId = useId();

  return (
    <div className={`fixed inset-0 ${layerClass[layer]} grid place-items-center bg-shade/60 p-4`} {...backdrop}>
      <div // eslint-disable-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-noninteractive-element-interactions -- a backdrop click is the mouse twin of Escape, which the focus trap handles; the panel only stops that click
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className={`w-full ${widthClass(size)} max-h-[85vh] overflow-y-auto rounded-2xl bg-surface p-6 ring-1 ring-line/10`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {icon && (
            <span className="text-3xl" aria-hidden>
              {icon}
            </span>
          )}
          <h2 id={titleId} className="text-base font-semibold text-ink-strong">
            {title}
          </h2>
        </div>
        <p id={messageId} className="mt-3 text-sm leading-relaxed text-ink-soft">
          {message}
        </p>
        <DialogActions>
          {/* Confirm has `autoFocus`; the focus trap must respect it though Cancel is first in the DOM. */}
          {onCancel && (
            <DialogButton onClick={onCancel} variant="secondary">
              {cancelLabel ?? t('common.cancel')}
            </DialogButton>
          )}
          <DialogButton autoFocus onClick={onConfirm} variant={danger ? 'danger' : 'primary'}>
            {confirmLabel}
          </DialogButton>
        </DialogActions>
      </div>
    </div>
  );
}
