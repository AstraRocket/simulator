import { describe, it, expect } from 'vitest';
import en from '../../src/i18n/locales/en.json';
import de from '../../src/i18n/locales/de.json';
import es from '../../src/i18n/locales/es.json';
import fr from '../../src/i18n/locales/fr.json';
import ptBR from '../../src/i18n/locales/pt-BR.json';
import ptPT from '../../src/i18n/locales/pt-PT.json';
import nl from '../../src/i18n/locales/nl.json';
import pl from '../../src/i18n/locales/pl.json';
import ru from '../../src/i18n/locales/ru.json';
import ja from '../../src/i18n/locales/ja.json';

type Tree = { [k: string]: string | Tree };

function flatten(node: Tree, prefix = '', out: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else flatten(v, key, out);
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/{{\s*([^}]+?)\s*}}/g)].map((m) => m[1]!).sort();

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const EN = flatten(en as Tree);

const base = (key: string) => key.replace(PLURAL_SUFFIX, '');

const FAMILIES = [
  ...new Set(
    Object.keys(EN)
      .filter((k) => PLURAL_SUFFIX.test(k))
      .map(base),
  ),
].sort();

const SINGULAR = Object.keys(EN).filter((k) => !PLURAL_SUFFIX.test(k));

const categories = (locale: string) => new Intl.PluralRules(locale).resolvedOptions().pluralCategories;

function required(locale: string): string[] {
  const cats = categories(locale);
  return [...SINGULAR, ...FAMILIES.flatMap((b) => cats.map((c) => `${b}_${c}`))];
}

const enFor = (key: string) => EN[key] ?? EN[`${base(key)}_other`];

const LOCALES: [string, Record<string, string>][] = [
  ['en', EN],
  ['de', flatten(de as Tree)],
  ['es', flatten(es as Tree)],
  ['fr', flatten(fr as Tree)],
  ['pt-BR', flatten(ptBR as Tree)],
  ['pt-PT', flatten(ptPT as Tree)],
  ['nl', flatten(nl as Tree)],
  ['pl', flatten(pl as Tree)],
  ['ru', flatten(ru as Tree)],
  ['ja', flatten(ja as Tree)],
];

describe('plural families', () => {
  it('has some, or every plural assertion below is passing on an empty list', () => {
    expect(FAMILIES.length).toBeGreaterThan(5);
  });

  it('never leaves a family base as a bare key too', () => {
    expect(FAMILIES.filter((b) => b in EN)).toEqual([]);
  });
});

describe.each(LOCALES)('%s locale', (name, L) => {
  it('has every key it needs (a gap silently renders as English)', () => {
    expect(required(name).filter((k) => !(k in L))).toEqual([]);
  });

  it('has no key it cannot reach (dead strings nothing selects)', () => {
    const allowed = new Set(required(name));
    expect(Object.keys(L).filter((k) => !allowed.has(k))).toEqual([]);
  });

  it('uses the same interpolation placeholders as English', () => {
    const mismatched = Object.keys(L)
      .filter((k) => enFor(k) !== undefined)
      .filter((k) => placeholders(enFor(k)!).join(',') !== placeholders(L[k]!).join(','))
      .map((k) => `${k}: en=[${placeholders(enFor(k)!).join(', ')}] vs [${placeholders(L[k]!).join(', ')}]`);
    expect(mismatched).toEqual([]);
  });

  it('interpolates {{count}} in every plural form', () => {
    // Russian `one` also covers 21, 31 and 101, so a literal "1" would be wrong.
    expect(
      Object.entries(L)
        .filter(([k, v]) => PLURAL_SUFFIX.test(k) && !v.includes('{{count}}'))
        .map(([k]) => k),
    ).toEqual([]);
  });

  it('has no empty or whitespace-only translations', () => {
    expect(
      Object.entries(L)
        .filter(([, v]) => v.trim() === '')
        .map(([k]) => k),
    ).toEqual([]);
  });
});
