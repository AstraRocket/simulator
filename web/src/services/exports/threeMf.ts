import type * as THREE from 'three';
import { zipSync, strToU8 } from 'fflate';
import { escapeXml } from '../files/xmlUtil';
import { M_TO_MM } from '../../prefs/units';
import { plainDecimal } from '../files/numberText';
import { hexOf, parseHexColor } from '../design/colorHex';
import { UNKNOWN_PART_COLOR } from '../design/partColors';
import { KeyedError } from '../../i18n/keyedError';

// Orientation is left alone (rocket axis along X) so the 3MF matches the STL.

export interface ThreeMfPart {
  name: string;
  /** Watertight, indexed geometry in meters (see `makeWatertight`). */
  geometry: THREE.BufferGeometry;
  color?: string;
}

export interface ThreeMfOptions {
  placeOnPlate?: boolean;
}

export const THREE_MF_MIME = 'model/3mf';

const UNKNOWN_RGB = parseHexColor(UNKNOWN_PART_COLOR) ?? 0;

/** The spec's `displaycolor` wants `#RRGGBBAA`. */
function displayColor(color: string | undefined): string {
  const rgb = parseHexColor(color) ?? UNKNOWN_RGB;
  return `${hexOf(rgb).toUpperCase()}FF`;
}

const fmt = (v: number): string => plainDecimal(v, 6, '0');

/** Meters in, millimeters out. */
function meshXml(part: ThreeMfPart, placeOnPlate: boolean): { xml: string; offset: [number, number, number] } {
  const pos = part.geometry.getAttribute('position');
  const idx = part.geometry.getIndex();
  if (!pos || !idx) throw new Error(`${part.name}: geometry is not indexed`);

  const verts: string[] = [];
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    minZ = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * M_TO_MM,
      y = pos.getY(i) * M_TO_MM,
      z = pos.getZ(i) * M_TO_MM;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    verts.push(`<vertex x="${fmt(x)}" y="${fmt(y)}" z="${fmt(z)}"/>`);
  }

  const tris: string[] = [];
  for (let i = 0; i < idx.count; i += 3) {
    // Winding unchanged: 3MF uses the same right-hand rule as `makeWatertight`.
    tris.push(`<triangle v1="${idx.getX(i)}" v2="${idx.getX(i + 1)}" v3="${idx.getX(i + 2)}"/>`);
  }

  const offset: [number, number, number] = placeOnPlate ? [-(minX + maxX) / 2, -(minY + maxY) / 2, -minZ] : [0, 0, 0];

  return {
    xml: `<mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh>`,
    offset,
  };
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`;

export function threeMfModelXml(parts: ThreeMfPart[], opts: ThreeMfOptions = {}): string {
  const placeOnPlate = opts.placeOnPlate ?? true;

  // The base-materials group takes id 1, so object n is id n+1 and `pindex` n.
  const bases = parts.map(
    (p) => `<base name="${escapeXml(p.name || 'Part')}" displaycolor="${displayColor(p.color)}"/>`,
  );

  const objects: string[] = [];
  const items: string[] = [];
  parts.forEach((part, i) => {
    const { xml, offset } = meshXml(part, placeOnPlate);
    const id = i + 2;
    objects.push(
      `<object id="${id}" type="model" pid="1" pindex="${i}" name="${escapeXml(part.name || 'Part')}">${xml}</object>`,
    );
    // Row-major 4x3: identity basis, then translation.
    const [tx, ty, tz] = offset;
    items.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${fmt(tx)} ${fmt(ty)} ${fmt(tz)}"/>`);
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <basematerials id="1">${bases.join('')}</basematerials>
    ${objects.join('\n    ')}
  </resources>
  <build>
    ${items.join('\n    ')}
  </build>
</model>
`;
}

export function buildThreeMf(parts: ThreeMfPart[], opts: ThreeMfOptions = {}): Uint8Array {
  if (parts.length === 0) throw new KeyedError('errors.export.nothing');
  return zipSync(
    {
      '[Content_Types].xml': strToU8(CONTENT_TYPES),
      '_rels/.rels': strToU8(RELS),
      '3D/3dmodel.model': strToU8(threeMfModelXml(parts, opts)),
    },
    { level: 6 },
  );
}
