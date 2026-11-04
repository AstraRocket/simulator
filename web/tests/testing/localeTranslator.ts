import type { Translate } from '../../src/services/exports/flightPathExport';

export function localeTranslator(bundle: unknown): Translate {
  return (key, vars) => {
    const raw = key
      .split('.')
      .reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), bundle);
    const text = typeof raw === 'string' ? raw : key;
    return vars
      ? text.replace(/{{(\w+)}}/g, (_m, name: string) => {
          const v = vars[name];
          return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
        })
      : text;
  };
}
