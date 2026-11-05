import { useTranslation } from 'react-i18next';
import { fmtNum } from '../../i18n/format';
import { useCatalogNoticeStore } from '../../state/catalogNoticeStore';
import { Banner } from '../common/Banner';

/** The live region stays mounted; only its contents come and go (see UpdateToast). */
export function CatalogNotice() {
  const { t } = useTranslation();
  const changes = useCatalogNoticeStore((s) => s.changes);
  const dismiss = useCatalogNoticeStore((s) => s.dismiss);
  return (
    <div role="status" aria-live="polite">
      {changes.length > 0 && (
        <Banner tone="accent" onDismiss={dismiss} dismissLabel={t('catalog.dismiss')}>
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
        </Banner>
      )}
    </div>
  );
}
