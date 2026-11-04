import { useTranslation } from 'react-i18next';

/** CC BY 4.0 requires this credit wherever Open-Meteo data is shown. */
export function OpenMeteoCredit({ className = 'text-[11px] text-ink-faint' }: { className?: string }) {
  const { t } = useTranslation();
  return <CcByCredit className={className} href="https://open-meteo.com/" label={t('weather.credit')} />;
}

/** GeoNames data (via Open-Meteo geocoding) is also CC BY 4.0. */
export function GeoNamesCredit({ className = 'text-[11px] text-ink-faint' }: { className?: string }) {
  const { t } = useTranslation();
  return <CcByCredit className={className} href="https://www.geonames.org/" label={t('placeSearch.credit')} />;
}

function CcByCredit({ className, href, label }: { className: string; href: string; label: string }) {
  return (
    <p className={className}>
      <a className="text-accent-400 hover:underline" href={href} target="_blank" rel="noreferrer">
        {label}
      </a>
      {' · '}
      <a
        className="text-accent-400 hover:underline"
        href="https://creativecommons.org/licenses/by/4.0/"
        target="_blank"
        rel="noreferrer"
      >
        CC BY 4.0
      </a>
    </p>
  );
}
