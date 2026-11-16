// cspell:ignore Strg -- German for Ctrl
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { isApplePlatform } from '../../services/app/device';

const iconBtn =
  'rounded-lg bg-raised px-2 py-1.5 xl:px-2.5 text-sm leading-none text-ink ring-1 ring-line/10 hover:bg-elevated disabled:cursor-not-allowed disabled:text-ink-dim disabled:hover:bg-raised';

export function UndoRedoButtons() {
  const { t } = useTranslation();
  const onUndo = useWorkspaceStore((s) => s.undo);
  const onRedo = useWorkspaceStore((s) => s.redo);
  const canUndo = useWorkspaceStore((s) => s.past.length > 0);
  const canRedo = useWorkspaceStore((s) => s.future.length > 0);
  // Apple's own symbols need no translation; elsewhere the key name does (Strg in German).
  const apple = isApplePlatform();
  const undoKeys = apple ? '⌘Z' : t('edit.undoKeys');
  const redoKeys = apple ? '⇧⌘Z' : t('edit.redoKeys');

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title={`${t('edit.undo')} (${undoKeys})`}
        aria-label={t('edit.undo')}
        className={iconBtn}
      >
        ↶
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title={`${t('edit.redo')} (${redoKeys})`}
        aria-label={t('edit.redo')}
        className={iconBtn}
      >
        ↷
      </button>
    </div>
  );
}
