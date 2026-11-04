import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { asStageNodes } from '../design/orkTree';
import { finMountOf } from '../../tree/finPlanform';
import { findNode } from '../../tree/treeWalk';
import { discSolidForNode, makeWatertight, ringSolid, solidForNode } from './solidMesh';
import { resolveDisc } from '../design/discGeometry';
import { DISC_TYPES } from '../files/componentFormats';
import { printableParts } from './printableParts';
import { colorForType } from '../design/partColors';
import { buildThreeMf, THREE_MF_MIME, type ThreeMfPart } from './threeMf';
import { exportFilename, saveBlob, safeFilename } from '../files/saveFile';
import { KeyedError } from '../../i18n/keyedError';
import { partLabel } from '../../i18n/format';
import i18n from '../../i18n';

// Import only dynamically: a static import puts the three.js meshers in the main bundle.

export interface PrintExportOptions {
  /** Absent = everything printable. */
  include?: ReadonlySet<string>;
  separateFiles?: boolean;
  placeOnPlate?: boolean;
  labels?: Readonly<Record<string, string>>;
}

export interface PrintExportResult {
  written: number;
  skipped: string[];
}

export function solidFor(tree: RocketTree, node: ComponentNode): ReturnType<typeof solidForNode> {
  const id = node.id as string;
  if (DISC_TYPES.has(node.type)) {
    const d = resolveDisc(tree, id);
    if (!d) return null;
    return d.holes ? ringSolid(d.outerR, d.holes, d.length) : discSolidForNode(d.outerR, d.innerR, d.length);
  }
  return solidForNode(node, finMountOf(tree, id));
}

function nodeById(tree: RocketTree, id: string): ComponentNode | null {
  return findNode(
    asStageNodes(tree).flatMap((stage) => stage.children ?? []),
    id,
  );
}

export async function downloadRocket3mf(
  name: string,
  tree: RocketTree,
  opts: PrintExportOptions = {},
): Promise<PrintExportResult> {
  const { include, separateFiles = false, placeOnPlate = true, labels } = opts;
  const nameOf = (e: { id: string; name?: string; type: string }): string =>
    (typeof e.name === 'string' && e.name.trim()) || labels?.[e.id] || partLabel(i18n.t, e);

  const built: { part: ThreeMfPart; id: string }[] = [];
  const skipped: string[] = [];
  for (const entry of printableParts(tree)) {
    if (include && !include.has(entry.id)) continue;
    const node = nodeById(tree, entry.id);
    const geometry = node ? solidFor(tree, node) : null;
    if (!geometry) {
      skipped.push(nameOf(entry));
      continue;
    }
    built.push({
      id: entry.id,
      part: {
        name: nameOf(entry),
        geometry: makeWatertight(geometry),
        color: colorForType(entry.type),
      },
    });
  }

  if (built.length === 0) throw new KeyedError('errors.export.noPrintable');

  if (!separateFiles) {
    const bytes = buildThreeMf(
      built.map((b) => b.part),
      { placeOnPlate },
    );
    await saveBlob(new Blob([bytes as BlobPart], { type: THREE_MF_MIME }), exportFilename([name, 'print'], '3mf'));
    return { written: built.length, skipped };
  }

  const { zipSync } = await import('fflate');
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const b of built) {
    // Security: the fallback is fixed text so a name like `../..` never becomes an entry name.
    let entry = safeFilename(b.part.name, 'part');
    let n = 2;
    while (used.has(entry)) entry = `${safeFilename(b.part.name, 'part')}-${n++}`;
    used.add(entry);
    files[`${entry}.3mf`] = buildThreeMf([b.part], { placeOnPlate });
  }
  await saveBlob(
    new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' }),
    exportFilename([name, '3mf'], 'zip'),
  );
  return { written: built.length, skipped };
}
