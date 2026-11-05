import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { fireAction } from '../../state/fireAction';
import { Dialog } from './Dialog';
import { DialogButton } from './DialogButton';
import { StatusLine } from './StatusLine';

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
  err: string | null;
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

export function EditorHeading({ onBack, backLabel, title }: { onBack: () => void; backLabel: string; title: string }) {
  return (
    <div className="sticky top-0 -mx-4 mb-1 flex items-center gap-2 bg-surface px-4 py-2">
      <EditorBack onBack={onBack} label={backLabel} />
      <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{title}</span>
    </div>
  );
}

export function MasterDetail({
  showsDetail,
  list,
  detail,
  hint,
}: {
  showsDetail: boolean;
  list: ReactNode;
  detail: ReactNode;
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

/** Always mounted: most screen readers skip a live region created with its text. */
export function MasterStatus({ err }: { err: string | null }) {
  return (
    <StatusLine tone="danger" className="px-4 py-2">
      {err}
    </StatusLine>
  );
}

/** Pass `err` as null rather than omitting it to keep its live region mounted. */
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
