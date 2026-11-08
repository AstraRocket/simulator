import type { RocketTree } from '../../engine/openRocketEngine';
import { findNode } from '../design/treeEdit';
import { solidToStl, solidToObj, solidToGlb, STL_MIME, OBJ_MIME, GLB_MIME } from '../exports/meshExport';
import { download, exportFilename } from './saveFile';
import { designNameOf } from '../app/appInfo';
import { buildThreeMf, THREE_MF_MIME } from '../exports/threeMf';
import { colorForType } from '../design/partColors';
import { makeWatertight } from '../exports/solidMesh';
import { componentToDxf, DXF_MIME } from '../exports/dxfExport';
import type { ExportFormat } from './componentFormats';
import { solidFor } from '../exports/rocketPrintExport';
import type { Translate } from '../../i18n/keyedError';
import { partLabel } from '../../i18n/format';
import i18n from '../../i18n';

// Pulls in the meshers and DXF writer, so load it only on demand.

export async function exportComponent(
  tree: RocketTree,
  nodeId: string,
  format: ExportFormat,
  rocketName: string = designNameOf(tree, null),
  t?: Translate,
): Promise<boolean> {
  const node = findNode(tree, nodeId);
  if (!node) return false;
  const label = partLabel((key, opts) => (t ? t(key, opts as Record<string, string>) : i18n.t(key, opts)), node);
  const name = (ext: string) => exportFilename([rocketName, label], ext, 'part');

  if (format === 'dxf') {
    const dxf = componentToDxf(tree, nodeId, t);
    if (dxf === null) return false;
    download(name('dxf'), dxf, DXF_MIME);
    return true;
  }

  const geometry = solidFor(tree, node);
  if (!geometry) return false;
  if (format === 'stl') download(name('stl'), solidToStl(geometry), STL_MIME);
  else if (format === 'obj') download(name('obj'), solidToObj(geometry), OBJ_MIME);
  else if (format === '3mf') {
    // The 3MF writer reads indices directly, so it needs welded geometry.
    const parts = [{ name: label, geometry: makeWatertight(geometry), color: colorForType(node.type) }];
    download(name('3mf'), buildThreeMf(parts) as BlobPart, THREE_MF_MIME);
  } else download(name('glb'), await solidToGlb(geometry), GLB_MIME);
  return true;
}
