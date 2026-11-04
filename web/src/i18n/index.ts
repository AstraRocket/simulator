import i18n, { type BackendModule, type ResourceKey } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import { nsKey } from '../services/storage/storageKeys';
import { toError } from '../services/app/errorMessage';

type LocaleModule = Promise<{ default: ResourceKey }>;

/** Order matters: a bare `pt` or unshipped region lands on the first matching row (resolve.test.ts). */
const LOCALES = [
  { code: 'en', name: 'English', load: () => Promise.resolve({ default: en }) },
  { code: 'de', name: 'Deutsch', load: () => import('./locales/de.json') },
  { code: 'es', name: 'Español', load: () => import('./locales/es.json') },
  { code: 'fr', name: 'Français', load: () => import('./locales/fr.json') },
  { code: 'pt-BR', name: 'Português (Brasil)', load: () => import('./locales/pt-BR.json') },
  { code: 'pt-PT', name: 'Português (Portugal)', load: () => import('./locales/pt-PT.json') },
  { code: 'nl', name: 'Nederlands', load: () => import('./locales/nl.json') },
  { code: 'pl', name: 'Polski', load: () => import('./locales/pl.json') },
  { code: 'ru', name: 'Русский', load: () => import('./locales/ru.json') },
  { code: 'ja', name: '日本語', load: () => import('./locales/ja.json') },
] as const satisfies readonly { code: string; name: string; load: () => LocaleModule }[];

export const LANGUAGES: { code: string; name: string }[] = LOCALES.map(({ code, name }) => ({ code, name }));

export const localeBackend: BackendModule = {
  type: 'backend',
  init: () => {},
  read: (language, _namespace, done) => {
    const row = LOCALES.find((l) => l.code === language);
    if (!row) {
      done(new Error(`no locale ${language}`), false);
      return;
    }
    row.load().then(
      (m) => done(null, m.default),
      (e: unknown) => done(toError(e), false),
    );
  },
};

// Bound before init so the first language set is caught. No document in the sim worker.
i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
});

i18n
  .use(LanguageDetector)
  .use(localeBackend)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en } },
    partialBundledLanguages: true,
    fallbackLng: 'en',
    supportedLngs: LANGUAGES.map((l) => l.code),
    // No `load: 'languageOnly'`: it collapses pt-BR and pt-PT onto an unshipped 'pt'.
    interpolation: { escapeValue: false },
    // No Suspense boundary sits above the app.
    react: { useSuspense: false },
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: nsKey('i18nextLng'),
    },
  })
  .catch((e: unknown) => {
    console.error('i18n init failed; the UI will show raw keys', e);
  });

export const LANGUAGE_WAIT_MS = 3000;

/** Asks of `language` itself: until its bundle is in, i18next resolves to English and reports it loaded. */
export function isLanguageReady(instance: typeof i18n = i18n): boolean {
  const changing = (instance as typeof instance & { isLanguageChangingTo?: string }).isLanguageChangingTo;
  return instance.isInitialized && !changing && instance.hasLoadedNamespace('translation', { lng: instance.language });
}

/** For text kept as a string: `t` before the bundle lands returns English, never retranslated. */
export function languageReady(instance: typeof i18n = i18n, ceilingMs = LANGUAGE_WAIT_MS): Promise<void> {
  if (isLanguageReady(instance)) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      instance.off('initialized', check);
      instance.off('loaded', check);
      instance.off('languageChanged', check);
      resolve();
    };
    const check = () => {
      if (isLanguageReady(instance)) done();
    };
    const timer = setTimeout(done, ceilingMs);
    instance.on('initialized', check);
    instance.on('loaded', check);
    instance.on('languageChanged', check);
  });
}

export default i18n;
