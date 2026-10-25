import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { confirm } from '../../state/confirmStore';
import { fireAction } from '../../state/fireAction';
import { Dialog } from './Dialog';
import { DialogButton } from './DialogButton';
import { StatusLine } from './StatusLine';

/**
 * The selection of a library dialog whose detail pane is an editor.
 *
 * The editor reports whether it holds unsaved edits (`onDirtyChange`), since
 * only the editor owns the draft, and `select` asks before a move would throw
 * them away. It resolves false when the user keeps editing.
 *
 * `err` is the dialog's footer line (a refused write). Moving the selection
 * clears it, since it was about what was selected before.
 */
export function useGuardedSelection(discardMessage: string) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Stable, because the editor passes it to an effect: a new function every
  // render would re-run that effect on every keystroke.
  const onDirtyChange = useCallback((d: boolean) => setDirty(d), []);

  const select = async (id: string | null): Promise<boolean> => {
    if (dirty && id !== selectedId) {
      const ok = await confirm({ message: discardMessage, confirmLabel: t('common.discard'), danger: true });
      if (!ok) return false;
      setDirty(false);
    }
    setSelectedId(id);
    setErr(null);
    return true;
  };

  /**
   * Closes the dialog, asking first when the editor holds unsaved edits.
   * Closing throws the draft away as surely as moving the selection does.
   */
  const close = async (onClose: () => void): Promise<void> => {
    if (dirty && !(await confirm({ message: discardMessage, confirmLabel: t('common.discard'), danger: true }))) return;
    onClose();
  };

  /** Moves the selection after a save or a delete, which leaves nothing to discard. */
  const settle = (id: string | null) => {
    setDirty(false);
    setSelectedId(id);
  };

  return { selectedId, dirty, select, settle, close, onDirtyChange, err, setErr };
}

/** The editor's half of the guard: report whether the draft differs from what is stored. */
export function useReportDirty(dirty: boolean, onDirtyChange: (dirty: boolean) => void) {
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
}

/**
 * The shell of a library dialog: list beside detail, each scrolling itself and
 * reaching the panel's edges, so the body takes the height and does its own
 * padding. The height is fixed rather than the viewport's, the way the motor
 * picker's is: the list is the working surface and should not become a
 * screen-tall column on a large monitor. Closing asks first when the editor
 * holds unsaved edits (`close` from `useGuardedSelection`).
 */
export function MasterDetailDialog({
  id,
  title,
  onClose,
  close,
  actions,
  err,
  loading,
  children,
}: {
  id: string;
  title: string;
  onClose: () => void;
  close: (onClose: () => void) => Promise<void>;
  actions?: ReactNode;
  /** The footer line: a refused write, or the list failing to load. */
  err: string | null;
  /** Before the list has loaded for the first time. */
  loading: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      id={id}
      title={title}
      onClose={() => fireAction(close(onClose))}
      size="4xl"
      layout="fill"
      height={720}
      actions={actions}
      footer={<MasterStatus err={err} />}
    >
      {loading ? (
        <p className="grid flex-1 place-items-center p-6 text-sm text-ink-muted">{t('common.loading')}</p>
      ) : (
        children
      )}
    </Dialog>
  );
}

/**
 * The phone's way back to the list. At `md` and up the list is beside the
 * editor, so there is nothing to go back to and it hides.
 */
export function EditorBack({
  onBack,
  label,
  className = '',
}: {
  onBack: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      onClick={onBack}
      className={`rounded px-1 text-sm text-ink-muted hover:text-ink md:hidden ${className}`}
      aria-label={label}
    >
      ‹
    </button>
  );
}

/** The editor's title, pinned over its scrolling fields with the back control. */
export function EditorHeading({ onBack, backLabel, title }: { onBack: () => void; backLabel: string; title: string }) {
  return (
    <div className="sticky top-0 -mx-4 mb-1 flex items-center gap-2 bg-surface px-4 py-2">
      <EditorBack onBack={onBack} label={backLabel} />
      <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{title}</span>
    </div>
  );
}

/**
 * The list beside the detail, each scrolling itself. On a phone the two panes
 * share the width, so only one shows at a time and the detail carries a back
 * control.
 */
export function MasterDetail({
  showsDetail,
  list,
  detail,
  hint,
}: {
  showsDetail: boolean;
  list: ReactNode;
  detail: ReactNode;
  /** What the detail pane says with nothing selected. */
  hint: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div
        className={`min-h-0 flex-col overflow-y-auto md:flex md:w-[300px] md:shrink-0 md:border-r md:border-line/10 ${
          showsDetail ? 'hidden md:flex' : 'flex'
        }`}
      >
        {list}
      </div>
      <div className={`min-h-0 min-w-0 flex-1 flex-col ${showsDetail ? 'flex' : 'hidden md:flex'}`}>
        {showsDetail ? (
          detail
        ) : (
          <div className="grid flex-1 place-items-center p-6 text-center text-sm text-ink-faint">{hint}</div>
        )}
      </div>
    </div>
  );
}

/** One row of the list: a name line and a detail line under it. */
export function MasterRow({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`block w-full px-4 py-2.5 text-left ${
        selected ? 'bg-accent-600/25 ring-1 ring-inset ring-accent-500/50' : 'hover:bg-raised'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The dialog footer line that reports a failed write.
 *
 * Always mounted, empty until there is something to say: a live region created
 * together with its text is not announced by most screen readers (see
 * UpdateToast), and this line is the dialog's only word on a refused write.
 */
export function MasterStatus({ err }: { err: string | null }) {
  return (
    <StatusLine tone="danger" className="px-4 py-2">
      {err}
    </StatusLine>
  );
}

/**
 * The editor's action row, pinned under its scrolling fields. Delete sits
 * apart from Save, at the other end of the row, because they are not two
 * grades of the same action. `children` goes between them.
 *
 * `err` is the editor's own refused save, beside the buttons it is about. Pass
 * it (null while there is nothing to say) and the line is always mounted, so
 * it is announced when the text arrives (see UpdateToast); leave it out when
 * the dialog's footer reports the editor's writes.
 */
export function EditorFooter({
  onDelete,
  dirty,
  onRevert,
  onSave,
  saveDisabled,
  saveTitle,
  err,
  children,
}: {
  onDelete?: () => void;
  dirty: boolean;
  onRevert: () => void;
  onSave: () => void;
  /** Beyond "nothing changed", which always disables Save. */
  saveDisabled?: boolean;
  saveTitle?: string;
  err?: string | null;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-line/10 p-2">
      {onDelete && (
        <button
          onClick={onDelete}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-danger-400 hover:bg-danger-500/10"
        >
          {t('common.delete')}
        </button>
      )}
      {children}
      {err !== undefined && (
        <StatusLine tone="danger" className="min-w-0 flex-1 truncate">
          {err}
        </StatusLine>
      )}
      <DialogButton size="sm" className="ml-auto" onClick={onRevert} disabled={!dirty}>
        {t('common.discard')}
      </DialogButton>
      <DialogButton
        variant="primary"
        size="sm"
        className="shrink-0"
        onClick={onSave}
        disabled={!dirty || saveDisabled}
        title={saveTitle}
      >
        {t('common.save')}
      </DialogButton>
    </div>
  );
}
