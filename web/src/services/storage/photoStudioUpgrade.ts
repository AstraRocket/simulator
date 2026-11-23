import type { RocketTree } from '../../engine/openRocketEngine';
import type { ImportNote } from '../files/importNote';
import { readPhotoStudio } from '../files/ork/photoStudio';

// A design opened before Photo Studio existed keeps its `<photostudio>` as raw XML among the document's unread
// elements, and an import note that says the app has no editor for it. Both move to where they live now.

const isPhotoXml = (raw: string): boolean => /^\s*<photostudio[\s>/]/.test(raw);

/** The raw block read into `photoStudio`, unless the design already has its own. */
export function upgradePhotoStudio(tree: RocketTree): RocketTree {
  const extra = tree.docExtra;
  const raw = extra?.find(isPhotoXml);
  if (!extra || raw === undefined || typeof DOMParser === 'undefined') return tree;
  const docExtra = extra.filter((x) => !isPhotoXml(x));
  const { docExtra: _old, ...rest } = tree;
  const out: RocketTree = docExtra.length ? { ...rest, docExtra } : rest;
  if (tree.photoStudio) return out;
  const doc = new DOMParser().parseFromString(`<openrocket>${raw}</openrocket>`, 'text/xml');
  if (doc.querySelector('parsererror') || !doc.documentElement) return out;
  const photoStudio = readPhotoStudio(doc.documentElement);
  return photoStudio ? { ...out, photoStudio } : out;
}

/** The stored "no editor for" note, without Photo Studio; gone when that was all it named. The same array if unchanged. */
export function upgradeNotes(notes: ImportNote[]): ImportNote[] {
  let changed = false;
  const out: ImportNote[] = [];
  for (const n of notes) {
    const items = typeof n === 'object' && n.key === 'importNote.noEditor' ? n.values?.['items'] : undefined;
    if (!items || typeof items !== 'object' || !('list' in items) || !items.list.includes('photostudio')) {
      out.push(n);
      continue;
    }
    changed = true;
    const list = items.list.filter((x) => x !== 'photostudio');
    if (list.length && typeof n === 'object') out.push({ ...n, values: { ...n.values, items: { ...items, list } } });
  }
  return changed ? out : notes;
}
