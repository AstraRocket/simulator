import { useTranslation } from 'react-i18next';
import { CatalogError, CatalogLoading } from '../common/CatalogLoading';

/** The motor catalog's failure or progress, or nothing once it has loaded. `centered` fills a pane. */
export function MotorCatalogGate({
  loading,
  error,
  onRetry,
  centered = false,
}: {
  loading: boolean;
  error: string | null | undefined;
  onRetry: () => void;
  centered?: boolean;
}) {
  const { t } = useTranslation();
  if (!error && !loading) return null;
  const body = error ? (
    <CatalogError message={`${t('catalog.failedMotors')} ${error}`} onRetry={onRetry} />
  ) : (
    <CatalogLoading name="motors" label={t('catalog.loadingMotors')} />
  );
  return centered ? <div className="grid min-h-0 flex-1 place-items-center p-6">{body}</div> : body;
}
