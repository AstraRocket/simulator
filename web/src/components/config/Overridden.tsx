import type { TFunction } from 'i18next';

export function Overridden({ children, t }: { children: React.ReactNode; t: TFunction }) {
  return (
    <span className="text-warn-300/90" title={t('configs.overridden')}>
      {children}
      <sup aria-hidden>*</sup>
      <span className="sr-only"> {t('configs.overridden')}</span>
    </span>
  );
}
