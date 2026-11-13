import type { DocumentMaterial } from '../../materials/documentMaterials';
import { byNameThenDensity, isDocumentMaterial } from '../../materials/documentMaterials';
import type { MaterialType } from '../../materials/materialTypes';
import { escapeXml } from '../xmlUtil';
import { desktopGroup } from './exportParts';
import { MAX_PASSTHROUGH } from './importLimits';

// As `Material.toStorableString`: `TYPE|name|density|shear modulus|group`. `fromStorableString` also
// reads the older four-field form, `TYPE|name|density|group`.

const FILE_TYPES: Readonly<Record<string, MaterialType>> = { BULK: 'bulk', SURFACE: 'surface', LINE: 'line' };

/** Mirrors Java's `split("\\|", 5)`: further bars stay in the last piece. */
function parseStorable(text: string): DocumentMaterial | null {
  const bars = text.split('|');
  const split = bars.length > 5 ? [...bars.slice(0, 4), bars.slice(4).join('|')] : bars;
  if (split.length < 3) return null;
  const type = Object.hasOwn(FILE_TYPES, split[0]!) ? FILE_TYPES[split[0]!] : undefined;
  if (!type) return null;
  const density = Number(split[2]!.trim());
  let group: string | undefined;
  let shearModulus = 0;
  if (split.length >= 4) {
    // A numeric fourth piece is the shear modulus; otherwise it is the group.
    const fourth = split[3]!.trim();
    if (fourth !== '' && Number.isFinite(Number(fourth))) {
      shearModulus = Number(fourth);
      group = split[4];
    } else group = split[3];
  }
  const m: DocumentMaterial = {
    name: split[1]!,
    type,
    density,
    ...(shearModulus !== 0 ? { shearModulus } : {}),
    ...(group ? { group } : {}),
  };
  return isDocumentMaterial(m) ? m : null;
}

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

/** Desktop order: `getAllMaterials` sorts all types together by name, then density. */
function docMaterialsXml(materials: DocumentMaterial[]): string {
  const lines = [...materials].sort(byNameThenDensity).map((m) => {
    // Desktop's own substitution: a bar would split the name.
    const name = m.name.replaceAll('|', ' ');
    const group = desktopGroup(m.group) ?? 'Other';
    return `<material>${escapeXml(`${m.type.toUpperCase()}|${name}|${m.density}|${m.shearModulus ?? 0}|${group}`)}</material>`;
  });
  return `<docmaterials>${lines.join('')}</docmaterials>`;
}

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
