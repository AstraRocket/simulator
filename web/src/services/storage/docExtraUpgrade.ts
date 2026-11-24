import type { RocketTree } from '../../engine/openRocketEngine';
import type { ImportNote } from '../files/importNote';
import { readPhotoStudio } from '../files/ork/photoStudio';
import { readCustomExpressions } from '../files/ork/dataTypes';

// A design opened before the app read `<photostudio>` or `<datatypes>` keeps it as raw XML among the document's
// unread elements, with an import note that says the app has no editor for it. Each moves to where it lives now.

type Own = Pick<RocketTree, 'photoStudio' | 'customExpressions'>;

const MOVED: readonly { tag: string; field: keyof Own; read: (docEl: Element) => Own }[] = [
  {
    tag: 'photostudio',
    field: 'photoStudio',
    read: (docEl) => {
      const photoStudio = readPhotoStudio(docEl);
      return photoStudio ? { photoStudio } : {};
    },
  },
  {
    tag: 'datatypes',
    field: 'customExpressions',
    read: (docEl) => {
      const customExpressions = readCustomExpressions(docEl);
      return customExpressions.length ? { customExpressions } : {};
    },
  },
];
const MOVED_TAGS: ReadonlySet<unknown> = new Set(MOVED.map((m) => m.tag));

/** The raw blocks read into the fields that hold them now, unless the design already has its own. */
export function upgradeDocExtra(tree: RocketTree): RocketTree {
  return MOVED.reduce((out, { tag, field, read }) => {
    const isOld = (raw: string) => new RegExp(`^\\s*<${tag}[\\s>/]`).test(raw);
    const raw = out.docExtra?.find(isOld);
    if (raw === undefined || typeof DOMParser === 'undefined') return out;
    const { docExtra, ...rest } = out;
    const left = (docExtra ?? []).filter((x) => !isOld(x));
    const moved: RocketTree = left.length ? { ...rest, docExtra: left } : rest;
    if (out[field]) return moved;
    const doc = new DOMParser().parseFromString(`<openrocket>${raw}</openrocket>`, 'text/xml');
    if (doc.querySelector('parsererror') || !doc.documentElement) return moved;
    return { ...moved, ...read(doc.documentElement) };
  }, tree);
}

/** The stored "no editor for" note, less what has one now; gone when that was all it named. The same array if unchanged. */
export function upgradeNotes(notes: ImportNote[]): ImportNote[] {
  let changed = false;
  const out: ImportNote[] = [];
  for (const n of notes) {
    const items = typeof n === 'object' && n.key === 'importNote.noEditor' ? n.values?.['items'] : undefined;
    if (!items || typeof items !== 'object' || !('list' in items) || !items.list.some((x) => MOVED_TAGS.has(x))) {
      out.push(n);
      continue;
    }
    changed = true;
    const list = items.list.filter((x) => !MOVED_TAGS.has(x));
    if (list.length && typeof n === 'object') out.push({ ...n, values: { ...n.values, items: { ...items, list } } });
  }
  return changed ? out : notes;
}
