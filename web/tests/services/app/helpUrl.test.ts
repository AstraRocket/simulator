import { describe, it, expect } from 'vitest';
import { docPageFileUrl, docPageUrl, helpUrlFor, localDocsUrlFor, HELP_URL } from '../../../src/services/app/appInfo';

const localized = (lang: string) => `${HELP_URL.replace(/\/*$/, '/')}${lang}/`;

describe('helpUrlFor', () => {
  it('sends English to the docs root', () => {
    expect(helpUrlFor('en')).toBe(HELP_URL);
  });

  it('sends Spanish to the Spanish tree', () => {
    expect(helpUrlFor('es')).toBe(localized('es'));
  });

  it('matches on the base language, so regional variants still work', () => {
    for (const tag of ['es-MX', 'es-419', 'es-ES', 'ES']) {
      expect(helpUrlFor(tag)).toBe(localized('es'));
    }
  });

  it('falls back to English for a language the docs do not build', () => {
    for (const tag of ['fr', 'de', 'ja', 'pt-BR']) {
      expect(helpUrlFor(tag)).toBe(HELP_URL);
    }
  });

  it('falls back to English for a missing or malformed language', () => {
    expect(helpUrlFor('')).toBe(HELP_URL);
    expect(helpUrlFor('-')).toBe(HELP_URL);
  });

  it('never produces a double slash', () => {
    expect(helpUrlFor('es')).not.toMatch(/[^:]\/\//);
  });
});

describe('docPageUrl', () => {
  it('appends the page to a base that ends in a slash', () => {
    expect(docPageUrl('https://example.test/docs/', 'safety')).toBe('https://example.test/docs/safety');
  });

  it('appends the page to a base that does not', () => {
    expect(docPageUrl('https://example.test/docs', 'safety')).toBe('https://example.test/docs/safety');
  });

  it('stays inside the localized tree', () => {
    expect(docPageUrl(helpUrlFor('es'), 'safety')).toBe(`${HELP_URL.replace(/\/*$/, '/')}es/safety`);
  });

  it('leaves an empty base empty, rather than linking at the app itself', () => {
    expect(docPageUrl('', 'safety')).toBe('');
  });

  it('never produces a double slash', () => {
    expect(docPageUrl('https://example.test/docs//', 'safety')).toBe('https://example.test/docs/safety');
  });
});

const appBase = import.meta.env.BASE_URL.replace(/\/*$/, '/');

describe('localDocsUrlFor', () => {
  it('points at the docs inside the app, not the docs site', () => {
    expect(localDocsUrlFor('en')).toBe(`${appBase}docs/`);
  });

  it('uses the same locale rule as the external link', () => {
    expect(localDocsUrlFor('es')).toBe(`${appBase}docs/es/`);
    expect(localDocsUrlFor('es-MX')).toBe(`${appBase}docs/es/`);
  });

  it('falls back to English for a language the docs do not build', () => {
    for (const tag of ['fr', 'ja', '', '-']) {
      expect(localDocsUrlFor(tag)).toBe(`${appBase}docs/`);
    }
  });

  it('is never empty, unlike the external base', () => {
    expect(localDocsUrlFor('en')).not.toBe('');
  });
});

// The file, not the directory: directoryIndex is off in vite.config.ts.
describe('docPageFileUrl', () => {
  it('addresses the index.html inside the page directory', () => {
    expect(docPageFileUrl('/docs/', 'safety')).toBe('/docs/safety/index.html');
  });

  it('addresses the docs index for the empty page', () => {
    expect(docPageFileUrl('/docs/', '')).toBe('/docs/index.html');
  });

  it('adds the separator when the base lacks one', () => {
    expect(docPageFileUrl('/docs', 'safety')).toBe('/docs/safety/index.html');
  });

  it('never produces a double slash', () => {
    expect(docPageFileUrl('/docs//', 'safety')).toBe('/docs/safety/index.html');
  });

  it('stays inside the localized tree', () => {
    expect(docPageFileUrl(localDocsUrlFor('es'), 'safety')).toBe(`${appBase}docs/es/safety/index.html`);
  });

  it('leaves an empty base empty rather than pointing at the app root', () => {
    expect(docPageFileUrl('', 'safety')).toBe('');
  });
});
