import { useTranslation } from 'react-i18next';

export function ImportedStar() {
  const { t } = useTranslation();
  return (
    <>
      <span aria-hidden="true" className="text-warn-400" title={t('motor.importedTitle')}>
        ★
      </span>
      <span className="sr-only">{t('motor.importedTitle')}</span>{' '}
    </>
  );
}
