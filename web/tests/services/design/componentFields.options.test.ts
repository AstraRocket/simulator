import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../../testing/dataDir';
import { FIELDS, type Field } from '../../../src/services/design/componentFields';

const LOCALES = ['en', 'de', 'es', 'fr', 'pt-BR', 'pt-PT', 'nl', 'pl', 'ru', 'ja'] as const;

// `DATA_DIR`, not `import.meta.url`, which jsdom turns into an http URL.
const messages = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    JSON.parse(readFileSync(join(DATA_DIR, '..', '..', 'src', 'i18n', 'locales', `${l}.json`), 'utf8')) as Record<
      string,
      unknown
    >,
  ]),
) as Record<(typeof LOCALES)[number], Record<string, unknown>>;

const lookup = (locale: (typeof LOCALES)[number], key: string): unknown =>
  key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown> | undefined)?.[part], messages[locale]);

const selects = Object.entries(FIELDS).flatMap(([type, fields]) =>
  fields.filter((f): f is Extract<Field, { kind: 'select' }> => f.kind === 'select').map((f) => ({ type, f })),
);

describe('select fields', () => {
  it('has some, or this whole file is passing on an empty list', () => {
    expect(selects.length).toBeGreaterThan(5);
  });

  it('gives every one a way to label its options', () => {
    const bare = selects.filter(({ f }) => !f.optI18n && !f.optLabel).map(({ type, f }) => `${type}.${f.key}`);
    expect(bare).toEqual([]);
  });

  it('resolves every option to a string in every locale', () => {
    const missing: string[] = [];
    for (const { type, f } of selects) {
      if (!f.optI18n) continue;
      for (const o of f.options) {
        for (const locale of LOCALES) {
          const v = lookup(locale, `${f.optI18n}.${o}`);
          if (typeof v !== 'string' || !v) missing.push(`${locale}: ${f.optI18n}.${o} (${type}.${f.key})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('capitalizes the English option text, the way the field labels are', () => {
    const lower: string[] = [];
    for (const { f } of selects) {
      if (!f.optI18n) continue;
      for (const o of f.options) {
        const v = lookup('en', `${f.optI18n}.${o}`);
        if (typeof v === 'string' && v && v[0] !== v[0]!.toUpperCase()) lower.push(`${f.optI18n}.${o} = ${v}`);
      }
    }
    expect(lower).toEqual([]);
  });
});

describe('the deploy event options', () => {
  it('cover every DeploymentConfiguration.DeployEvent', () => {
    const java = readFileSync(
      join(process.cwd(), '../engine-java/src/java/info/openrocket/core/rocketcomponent/DeploymentConfiguration.java'),
      'utf8',
    );
    const body = java.slice(java.indexOf('enum DeployEvent'));
    const kernel = [...body.matchAll(/^\t\t([A-Z_]+)\(/gm)].map((m) => m[1]!.toLowerCase());
    expect(kernel.length).toBeGreaterThan(4);
    const field = FIELDS['parachute']!.find((f: Field) => f.key === 'deployEvent')!;
    const options = 'options' in field ? (field.options ?? []) : [];
    expect([...options].sort()).toEqual([...kernel].sort());
  });
});
