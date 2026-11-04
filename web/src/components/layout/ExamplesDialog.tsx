import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { fireAction } from '../../state/fireAction';
import { Dialog } from '../common/Dialog';
import { loadExampleIndex, type ExampleMeta } from '../../services/storage/exampleLibrary';
import { useAsyncLoad } from '../common/useAsyncLoad';
import { CatalogError } from '../common/CatalogLoading';

export function ExampleList({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const openExample = useWorkspaceStore((s) => s.openExample);
  const loaded = useAsyncLoad(loadExampleIndex, 'examples');
  const examples: ExampleMeta[] | null = loaded.data ?? null;

  if (loaded.error !== null) return <CatalogError message={t('library.examplesFailed')} onRetry={loaded.retry} />;
  if (!examples) return <p className="px-4 py-8 text-center text-sm text-ink-muted">{t('common.loading')}</p>;

  return (
    <ul className="min-h-0 flex-1 divide-y divide-line/5 overflow-y-auto">
      {examples.map((e) => (
        <li key={e.id}>
          <button
            onClick={() => {
              fireAction(openExample(e.file));
              onClose();
            }}
            className="w-full px-4 py-2.5 text-left hover:bg-line/5"
          >
            <span className="text-sm text-ink-strong">{e.name}</span>
            {e.description && (
              // No `block`: `line-clamp-2` sets display, and a later `block` cancels the clamp.
              <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-ink-muted">{e.description}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ExamplesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();

  return (
    <Dialog
      id="examples"
      title={t('library.examplesTitle')}
      onClose={onClose}
      size="lg"
      toolbar={<p className="px-4 py-2 text-xs leading-snug text-ink-muted">{t('library.examplesIntro')}</p>}
    >
      <ExampleList onClose={onClose} />
    </Dialog>
  );
}
