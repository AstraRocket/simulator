import i18n from '../../i18n';
import { baseLanguage } from '../../i18n/language';

export const APP_VERSION: string = __APP_VERSION__;

export const HELP_URL: string = __HELP_URL__;

const withTrailingSlash = (url: string): string => url.replace(/\/*$/, '/');

export const DOC_LOCALES = new Set(['es']);
export function helpUrlFor(language: string): string {
  const lang = baseLanguage(language);
  if (!HELP_URL || !DOC_LOCALES.has(lang)) return HELP_URL;
  return `${withTrailingSlash(HELP_URL)}${lang}/`;
}

/** The trailing slash matters: without it the slug replaces the last path segment. */
export function docPageUrl(base: string, page: string): string {
  if (!base) return base;
  return `${withTrailingSlash(base)}${page}`;
}

export function localDocsUrlFor(language: string): string {
  const base = `${withTrailingSlash(import.meta.env.BASE_URL)}docs/`;
  const lang = baseLanguage(language);
  return DOC_LOCALES.has(lang) ? `${base}${lang}/` : base;
}

/** Only the `index.html` form opens offline: the SW precaches by file name and `directoryIndex` is off. */
export function docPageFileUrl(base: string, page: string): string {
  const url = docPageUrl(base, page);
  return url ? `${withTrailingSlash(url)}index.html` : url;
}

/** `date` is the upstream commit's date (UTC), not the build's. */
export const UPSTREAM: { ref: string; shortRef: string; date: string; commitUrl: string } = __UPSTREAM__;

export const CONTRIBUTORS_URL: string = __CONTRIBUTORS_URL__;

export const isPreRelease = (version: string = APP_VERSION): boolean => {
  const major = parseInt(version, 10);
  return Number.isFinite(major) && major < 1;
};

export const appName = (): string => i18n.t('app.title');

export const defaultDesignName = (): string => i18n.t('app.designName', { name: appName() });

export function designNameOf(tree: { name?: unknown }, loadedMeta?: { name?: string } | null): string {
  const own = typeof tree.name === 'string' ? tree.name.trim() : '';
  return own || loadedMeta?.name?.trim() || defaultDesignName();
}
