// @vitest-environment jsdom
import { describe, it, expect, afterAll } from 'vitest';
import i18n, { LANGUAGES } from '../../src/i18n/index';

const CASES: [tag: string, bundle: string][] = [
  ['en', 'en'],
  ['de', 'de'],
  ['es', 'es'],
  ['fr', 'fr'],
  ['pt-BR', 'pt-BR'],
  ['pt-PT', 'pt-PT'],
  ['nl', 'nl'],
  ['pl', 'pl'],
  ['ru', 'ru'],
  ['ja', 'ja'],
  ['en-GB', 'en'],
  ['de-CH', 'de'],
  ['es-ES', 'es'],
  ['es-MX', 'es'],
  ['fr-CA', 'fr'],
  ['nl-BE', 'nl'],
  ['pl-PL', 'pl'],
  ['ru-UA', 'ru'],
  ['ja-JP', 'ja'],
  ['pt', 'pt-BR'],
  ['pt-br', 'pt-BR'],
  // Widening picks the first pt-* row; pt-BR first is deliberate.
  ['pt-AO', 'pt-BR'],
  ['pt-MZ', 'pt-BR'],
  ['zh-Hans-CN', 'en'],
  ['hu', 'en'],
];

afterAll(async () => {
  await i18n.changeLanguage('en');
});

describe('language resolution', () => {
  it.each(CASES)('%s resolves to the %s bundle', async (tag, bundle) => {
    await i18n.changeLanguage(tag);
    expect(i18n.resolvedLanguage).toBe(bundle);
  });

  it('resolves every selectable language to its own bundle', async () => {
    for (const { code } of LANGUAGES) {
      await i18n.changeLanguage(code);
      expect(i18n.resolvedLanguage).toBe(code);
    }
  });
});
