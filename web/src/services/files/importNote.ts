import { keyedText, type Keyed, type Translate } from '../../i18n/keyedError';
import { fmtList } from '../../i18n/format';

/** A plain string comes only from an older saved workspace; never create one. */
export type ImportNote = string | KeyedNote;

export interface KeyedNote {
  key: string;
  values?: NoteValues;
}

export type NoteValue = string | number | Keyed | NoteList;
export type NoteValues = { [name: string]: NoteValue };

export interface NoteList {
  list: (string | Keyed)[];
  quote?: boolean;
  more?: boolean;
}

export function keyedNote(key: string, values?: NoteValues): ImportNote {
  return values ? { key, values } : { key };
}

export function noteList(list: (string | Keyed)[], opts: { quote?: boolean; more?: boolean } = {}): NoteList {
  return { list, ...(opts.quote ? { quote: true } : {}), ...(opts.more ? { more: true } : {}) };
}

export function notePartName(node: { name?: unknown; type: string }): string | Keyed {
  const own = typeof node.name === 'string' ? node.name.trim() : '';
  return own || { key: `part.${node.type}` };
}

const isList = (v: unknown): v is NoteList =>
  !!v && typeof v === 'object' && Array.isArray((v as { list?: unknown }).list);

const isKeyedValue = (v: unknown): v is Keyed =>
  !!v && typeof v === 'object' && typeof (v as { key?: unknown }).key === 'string';

const itemText = (item: unknown, t: Translate): string =>
  typeof item === 'string' ? item : isKeyedValue(item) ? keyedText(item, t) : '';

function valueText(v: NoteValue, t: Translate): string | number {
  if (isList(v)) {
    const items = v.list.map((item) => itemText(item, t)).map((s) => (v.quote ? `"${s}"` : s));
    return `${fmtList(items)}${v.more ? ' …' : ''}`;
  }
  if (isKeyedValue(v)) return keyedText(v, t);
  return typeof v === 'string' || typeof v === 'number' ? v : '';
}

export function importNoteText(note: ImportNote, t: Translate): string {
  if (typeof note === 'string') return note;
  if (!note || typeof note !== 'object' || typeof note.key !== 'string') return '';
  if (!note.values) return t(note.key);
  const flat: Record<string, string | number> = {};
  for (const [name, v] of Object.entries(note.values)) flat[name] = valueText(v, t);
  return t(note.key, flat);
}
