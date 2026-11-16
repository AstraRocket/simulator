import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { useSettings } from '../../state/useSettings';
import { importNoteText, type ImportNote } from '../../services/files/importNote';
import type { DesignFormat } from '../../services/files/designFile';
import { designNameOf } from '../../services/app/appInfo';

// Module-level so it survives the card's remounts this session.
let notesOpenedForImport = 0;
export function LoadedBanner({
  loaded,
  onClose,
}: {
  // `format` is absent on older stored imports.
  loaded: { name: string; notes: ImportNote[]; format?: DesignFormat } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const treeName = useWorkspaceStore((s) => s.tree.name);
  const { settings, update } = useSettings();
  const open = settings.showImportNotes;
  const repaired = useWorkspaceStore((s) => s.repairNotes);
  const notes: ImportNote[] = [...(loaded?.notes ?? []), ...repaired];
  const count = notes.length;
  const importSeq = useWorkspaceStore((s) => s.importSeq);
  useEffect(() => {
    if (importSeq <= notesOpenedForImport || count === 0) return;
    notesOpenedForImport = importSeq;
    if (!open) update({ showImportNotes: true });
  }, [importSeq, count, open, update]);
  // The tree's name is the live one; `loaded.name` is only what the file arrived with.
  const name = designNameOf({ name: treeName }, loaded);

  const shell = loaded || repaired.length ? 'm-3 rounded-xl bg-surface p-3 ring-1 ring-line/10' : 'mx-3 mt-2';

  return (
    <div className={shell}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          {loaded && (
            <div className="text-[10px] uppercase tracking-wide text-ink-muted">
              {loaded.format ? t('banner.loaded', { ext: `.${loaded.format}` }) : t('banner.loadedFile')}
            </div>
          )}
          <div
            data-testid="design-name"
            className={`min-w-0 truncate px-1 py-0.5 font-semibold text-ink ${loaded ? 'text-lg' : 'text-sm'}`}
          >
            {name}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {count > 0 && (
            <button
              onClick={() => update({ showImportNotes: !open })}
              aria-expanded={open}
              className="flex items-center gap-1.5 rounded-lg bg-raised px-2 py-1.5 text-xs text-warn-300 ring-1 ring-line/10 hover:bg-elevated"
            >
              <span aria-hidden>⚠</span>
              {t('banner.notes', { count })}
              <span aria-hidden className="text-[9px] text-ink-muted">
                {open ? '▾' : '▸'}
              </span>
            </button>
          )}
          {loaded && (
            <button
              onClick={onClose}
              title={t('banner.closeTitle')}
              className="rounded-lg bg-raised px-3 py-1.5 text-xs text-ink-soft ring-1 ring-line/10 hover:bg-elevated"
            >
              {t('banner.close')}
            </button>
          )}
        </div>
      </div>
      {count > 0 && open && (
        <ul className="mt-2 space-y-1 text-xs text-warn-300">
          {notes.map((n, i) => (
            <li key={i}>⚠ {importNoteText(n, t)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
