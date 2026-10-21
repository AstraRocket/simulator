import type { DocumentMaterial } from '../../materials/documentMaterials';
import { byNameThenDensity, isDocumentMaterial } from '../../materials/documentMaterials';
import type { MaterialType } from '../../materials/materialTypes';
import { escapeXml } from '../xmlUtil';
import { desktopGroup } from './exportParts';
import { MAX_PASSTHROUGH } from './importLimits';

/**
 * The design's own materials in a `.ork`: `<docprefs><docmaterials>`, one
 * `<material>` per entry holding desktop's storable string
 * (`Material.toStorableString`, `DocumentMaterialHandler`).
 *
 * 24.12 writes `TYPE|name|density|group`; upstream's newer saver puts the
 * in-plane shear modulus between the density and the group. Both are read,
 * as upstream's `fromStorableString` reads both, and the 24.12 form is written
 * so the file opens in the desktop release people have.
 */

const FILE_TYPES: Readonly<Record<string, MaterialType>> = { BULK: 'bulk', SURFACE: 'surface', LINE: 'line' };

/**
 * One entry, or null for one desktop could not build a usable material from.
 * Java's `split("\\|", 5)` keeps any further bars in the last piece, which is
 * what the slice below does.
 */
function parseStorable(text: string): DocumentMaterial | null {
  const bars = text.split('|');
  const split = bars.length > 5 ? [...bars.slice(0, 4), bars.slice(4).join('|')] : bars;
  if (split.length < 3) return null;
  const type = Object.hasOwn(FILE_TYPES, split[0]!) ? FILE_TYPES[split[0]!] : undefined;
  const density = Number(split[2]!.trim());
  let group: string | undefined;
  if (split.length >= 4) {
    // The fourth piece is the shear modulus when it is a number, else the
    // group (the older four-piece form).
    const fourth = split[3]!.trim();
    if (fourth !== '' && Number.isFinite(Number(fourth))) group = split[4];
    else group = split[3];
  }
  const m: DocumentMaterial = { name: split[1]!, type: type!, density, ...(group ? { group } : {}) };
  return isDocumentMaterial(m) ? m : null;
}

/**
 * Read the document's materials and take `<docmaterials>` out of
 * `<docprefs>`, so the rest of `<docprefs>` still rides through as passthrough
 * and the writer puts the list back from the tree, where it can be edited.
 *
 * `skipped` counts entries that are not a usable material (an unknown type, a
 * density that is not a number above zero, an empty name) or past the cap.
 */
export function takeDocumentMaterials(docEl: Element): { materials: DocumentMaterial[]; skipped: number } {
  const materials: DocumentMaterial[] = [];
  let skipped = 0;
  for (const prefs of Array.from(docEl.children).filter((c) => c.tagName === 'docprefs')) {
    for (const list of Array.from(prefs.children).filter((c) => c.tagName === 'docmaterials')) {
      for (const el of Array.from(list.children).filter((c) => c.tagName === 'material')) {
        const m = parseStorable(el.textContent ?? '');
        if (!m || materials.length === MAX_PASSTHROUGH) skipped++;
        else materials.push(m);
      }
      list.remove();
    }
  }
  return { materials, skipped };
}

/**
 * `<docmaterials>` for the list, in desktop's order: `getAllMaterials` puts the
 * three databases into one `Database`, which sorts every entry by name and then
 * density whatever its type.
 */
function docMaterialsXml(materials: DocumentMaterial[]): string {
  const lines = [...materials].sort(byNameThenDensity).map((m) => {
    // Desktop's own substitution: a bar would split the name.
    const name = m.name.replaceAll('|', ' ');
    const group = desktopGroup(m.group) ?? 'Other';
    return `<material>${escapeXml(`${m.type.toUpperCase()}|${name}|${m.density}|${group}`)}</material>`;
  });
  return `<docmaterials>${lines.join('')}</docmaterials>`;
}

/**
 * The document-level passthrough with the design's materials written into its
 * `<docprefs>`, or a `<docprefs>` of their own at the end, where desktop's
 * saver writes it, when the file had none.
 */
export function withDocumentMaterialsXml(docExtra: string[], materials: DocumentMaterial[]): string[] {
  if (!materials.length) return docExtra;
  const block = docMaterialsXml(materials);
  const at = docExtra.findIndex((raw) => /^<docprefs[\s/>]/.test(raw));
  if (at < 0) return [...docExtra, `<docprefs>${block}</docprefs>`];
  const raw = docExtra[at]!;
  const merged = raw.endsWith('/>')
    ? `${raw.slice(0, -2).trimEnd()}>${block}</docprefs>`
    : `${raw.slice(0, raw.lastIndexOf('</docprefs>'))}${block}</docprefs>`;
  return docExtra.map((r, i) => (i === at ? merged : r));
}
