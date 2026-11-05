import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../../i18n';
import { fireAction } from '../../state/fireAction';
import { LanguageOptions } from '../common/LanguageOptions';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const selected = LANGUAGES.find((l) => l.code === i18n.resolvedLanguage)?.name ?? '';
  return (
    // A native select is as wide as its widest option, so an invisible sizer sets the
    // closed width; it must match the select's text metrics and padding.
    <span className="relative inline-flex max-w-24 items-center xl:max-w-28">
      <span aria-hidden className="invisible truncate py-1.5 pr-7 pl-2 text-xs font-medium">
        {selected}
      </span>
      <select
        value={i18n.resolvedLanguage}
        onChange={(e) => fireAction(i18n.changeLanguage(e.target.value))}
        aria-label={t('lang.label')}
        title={t('lang.label')}
        className="absolute inset-0 h-full w-full appearance-none truncate rounded-lg bg-raised pr-7 pl-2 text-xs font-medium text-ink ring-1 ring-line/10 focus:ring-accent-500 focus:outline-none"
      >
        <LanguageOptions />
      </select>
      {/* Own chevron: the native arrow squeezes the name ('English' closes as 'E...'). */}
      <svg
        aria-hidden
        viewBox="0 0 10 6"
        className="pointer-events-none absolute right-2.5 h-1.5 w-2.5 fill-none stroke-ink-muted stroke-2"
      >
        <path d="M1 1l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
