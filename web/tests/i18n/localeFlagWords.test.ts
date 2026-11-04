import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import i18n, { LANGUAGES } from '../../src/i18n';

const NATIVE: Record<string, readonly string[]> = {
  fr: [
    'aluminium',
    'analyse',
    'catalogue',
    'catalogues',
    'centre',
    'fibre',
    'fibres',
    'minimise',
    'organisation',
    'sombre',
    'stabiliser',
    'utilise',
    'visualisation',
  ],
  es: ['calibre'],
  de: ['aluminium', 'analyse', 'organisation'],
  nl: ['aluminium', 'analyse'],
  pl: ['aluminium'],
};

const LOCALES = Object.fromEntries(
  LANGUAGES.map(({ code }) => [code, i18n.getResourceBundle(code, 'translation') as unknown]),
);

const flagWords: string[] = (
  JSON.parse(readFileSync(fileURLToPath(new URL('../../../cspell.json', import.meta.url)), 'utf8')) as {
    flagWords: string[];
  }
).flagWords;

const values = (node: unknown, out: string[] = []): string[] => {
  if (typeof node === 'string') out.push(node);
  else if (node && typeof node === 'object') for (const v of Object.values(node)) values(v, out);
  return out;
};

describe('no British spelling reaches a translated string', () => {
  it('reads every registered locale from the app', () => {
    expect(Object.keys(LOCALES)).toContain('en');
    for (const [code, bundle] of Object.entries(LOCALES)) expect(bundle, code).toBeTypeOf('object');
  });

  it('reads the forbidden list out of cspell.json, so there is one copy', () => {
    expect(flagWords.length).toBeGreaterThan(50);
    expect(flagWords).toContain('colour');
    expect(flagWords).toContain('centre');
  });

  for (const [locale, bundle] of Object.entries(LOCALES)) {
    it(`${locale} carries none`, () => {
      const allowed = new Set(NATIVE[locale] ?? []);
      const forbidden = new Set(flagWords.map((w) => w.toLowerCase()));
      const hits = new Set<string>();
      for (const text of values(bundle)) {
        for (const word of text.match(/[A-Za-z]+/g) ?? []) {
          const w = word.toLowerCase();
          if (forbidden.has(w) && !allowed.has(w)) hits.add(w);
        }
      }
      expect([...hits].sort()).toEqual([]);
    });
  }

  it('does not allow a word that is not actually on the list', () => {
    const forbidden = new Set(flagWords.map((w) => w.toLowerCase()));
    for (const [locale, words] of Object.entries(NATIVE)) {
      for (const w of words) expect(forbidden, `${locale}: ${w}`).toContain(w);
    }
  });
});
