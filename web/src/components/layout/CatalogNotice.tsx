import { useTranslation } from 'react-i18next';
import { fmtNum } from '../../i18n/format';
import { useCatalogNoticeStore } from '../../state/catalogNoticeStore';

/**
 * "The motor catalog was updated" after the scheduled sync replaced a catalog
 * this browser had loaded before (services/app/catalogUpdates.ts).
 *
 * A banner under the header like the app-update one (UpdateToast), and for the
 * same reason not a modal: it arrives while the catalog loads in the
 * background, which can be in the middle of an edit. It says how many entries
 * are new and how many are gone, and stays until dismissed.
 *
 * The live region is always mounted; only its contents come and go (see
 * UpdateToast).
 */
export function CatalogNotice() {
  const { t } = useTranslation();
  const changes = useCatalogNoticeStore((s) => s.changes);
  const dismiss = useCatalogNoticeStore((s) => s.dismiss);
  return (
    <div role="status" aria-live="polite">
      {changes.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-accent-500/40 bg-accent-900/60 px-4 py-2 text-sm text-accent-50">
          <div className="min-w-0 flex-1">
            {changes.map((c) => (
              <p key={c.name}>
                {t(c.name === 'motors' ? 'catalog.updatedMotors' : 'catalog.updatedComponents', {
                  added: fmtNum(c.added),
                  removed: fmtNum(c.removed),
                })}
              </p>
            ))}
          </div>
          <button
            onClick={dismiss}
            className="shrink-0 rounded-lg px-1 py-1.5 text-accent-300 hover:text-on-accent"
            aria-label={t('catalog.dismiss')}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
