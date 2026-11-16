import { useEffect, useState } from 'react';
import { fmtDateTime } from '../../i18n/format';
import { useTabs } from '../common/useTabs';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { fireAction } from '../../state/fireAction';
import { confirmDelete } from '../../state/confirmStore';
import { Dialog } from '../common/Dialog';
import { DesignPropertiesDialog } from './DesignPropertiesDialog';
import { ExampleList } from './ExamplesDialog';
import { LIBRARY_TABS, type LibraryTab } from './dialogKeys';

export function DesignLibraryDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const designs = useWorkspaceStore((s) => s.designs);
  const activeId = useWorkspaceStore((s) => s.activeDesignId);
  const refresh = useWorkspaceStore((s) => s.refreshDesigns);
  const openDesign = useWorkspaceStore((s) => s.openDesign);
  const renameDesign = useWorkspaceStore((s) => s.renameDesign);
  const deleteDesign = useWorkspaceStore((s) => s.deleteDesign);
  // Do not key the refresh effect on `onClose`: a new arrow each render, so it would loop.

  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [tab, setTab] = useState<LibraryTab>('mine');
  const tabs = useTabs(LIBRARY_TABS, tab, setTab);

  useEffect(() => {
    fireAction(refresh());
  }, [refresh]);

  const askDelete = async (id: string, name: string) => {
    const ok = await confirmDelete(t('library.deleteConfirm', { name }));
    if (ok) await deleteDesign(id);
  };

  return (
    <>
      <Dialog
        id="designLibrary"
        title={t('library.title')}
        onClose={onClose}
        size="lg"
        toolbar={
          <div role="tablist" aria-label={t('library.title')} className="flex gap-1 px-2 pt-2">
            {LIBRARY_TABS.map((key) => (
              <button
                key={key}
                {...tabs.tab(key)}
                className={`rounded-t-md px-3 py-1.5 text-xs font-medium ${
                  tab === key ? 'bg-line/10 text-ink-strong' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {key === 'mine' ? t('library.mine') : t('library.examples')}
              </button>
            ))}
          </div>
        }
      >
        <div {...tabs.panel} className="flex min-h-0 flex-1 flex-col">
          {tab === 'examples' ? (
            <ExampleList onClose={onClose} />
          ) : designs.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">{t('library.empty')}</p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-line/5 overflow-y-auto">
              {designs.map((d) => (
                <li key={d.id} className="flex items-center gap-2 px-4 py-2.5">
                  <button
                    onClick={() => {
                      fireAction(openDesign(d.id));
                      onClose();
                    }}
                    className="flex-1 text-left"
                  >
                    <span
                      className={`text-sm ${d.id === activeId ? 'font-semibold text-accent-400' : 'text-ink-strong'}`}
                    >
                      {d.name}
                    </span>
                    <span className="ml-2 text-xs text-ink-faint">
                      {fmtDateTime(d.updatedAt)}
                      {d.id === activeId && ` · ${t('library.open')}`}
                    </span>
                  </button>
                  <button
                    onClick={() => setRenaming({ id: d.id, name: d.name })}
                    aria-label={t('library.renameNamed', { name: d.name })}
                    className="rounded px-2 py-1 text-xs text-ink-muted hover:text-ink"
                  >
                    {t('library.rename')}
                  </button>
                  <button
                    onClick={() => fireAction(askDelete(d.id, d.name))}
                    aria-label={t('library.deleteNamed', { name: d.name })}
                    className="rounded px-2 py-1 text-xs text-ink-muted hover:text-danger-300"
                  >
                    {t('common.delete')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>

      {renaming && (
        <DesignPropertiesDialog
          title={t('library.rename')}
          confirmLabel={t('library.rename')}
          initialName={renaming.name}
          takenNames={designs.filter((d) => d.id !== renaming.id).map((d) => d.name)}
          onCancel={() => setRenaming(null)}
          onConfirm={(name) => {
            fireAction(renameDesign(renaming.id, name));
            setRenaming(null);
          }}
        />
      )}
    </>
  );
}
