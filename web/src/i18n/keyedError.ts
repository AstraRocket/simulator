import en from './locales/en.json';
import { errorMessage } from '../services/app/errorMessage';
import { isRecord } from '../services/app/numbers';

export interface Keyed {
  /** The full i18n key, so every call site names it literally. */
  key: string;
  values?: KeyedValues;
}

export type KeyedValues = { [name: string]: string | number | Keyed };

export type Translate = (key: string, values?: Record<string, string | number>) => string;

export class KeyedError extends Error implements Keyed {
  readonly key: string;
  readonly values?: KeyedValues;

  constructor(key: string, values?: KeyedValues) {
    super(englishText(key, values));
    this.name = 'KeyedError';
    this.key = key;
    if (values) this.values = values;
  }
}

type Tree = { [k: string]: string | Tree };

export function englishText(key: string, values?: KeyedValues): string {
  let node: string | Tree | undefined = en;
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
  if (typeof node !== 'string') return key;
  return node.replace(/{{\s*([^}]+?)\s*}}/g, (whole, name: string) => {
    const v = values?.[name];
    if (v === undefined) return whole;
    return typeof v === 'object' ? englishText(v.key, v.values) : String(v);
  });
}

export function keyedText(k: Keyed, t: Translate): string {
  if (!k.values) return t(k.key);
  const flat: Record<string, string | number> = {};
  for (const [name, v] of Object.entries(k.values)) flat[name] = typeof v === 'object' ? keyedText(v, t) : v;
  return t(k.key, flat);
}

export function errorText(e: unknown, t: Translate): string {
  return e instanceof KeyedError ? keyedText(e, t) : errorMessage(e);
}

/** A failed action's banner text: `key` takes the cause as `{{reason}}`. */
export function actionError(
  key: string,
  e: unknown,
  t: Translate,
  values: Record<string, string | number> = {},
): string {
  return t(key, { ...values, reason: errorText(e, t) });
}

export function errorReason(e: unknown): string | Keyed {
  return e instanceof KeyedError ? (e.values ? { key: e.key, values: e.values } : { key: e.key }) : errorMessage(e);
}

export function isKeyed(v: unknown): v is Keyed {
  if (!v || typeof v !== 'object') return false;
  const { key, values } = v as { key?: unknown; values?: unknown };
  if (typeof key !== 'string' || key === '') return false;
  if (values === undefined) return true;
  if (!isRecord(values)) return false;
  return Object.values(values).every((x) => typeof x === 'string' || typeof x === 'number' || isKeyed(x));
}
