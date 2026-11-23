// cspell:ignore Zippable -- fflate's type name
import { zipSync, strToU8, type Zippable } from 'fflate';
import { exportOrk, type OrkTreeExportInput } from './orkFile';
import { saveBlob, saveText, exportFilename } from './saveFile';
import type { RocketTree, StaticInfo } from '../../engine/openRocketEngine';
import type { FlightConfig } from '../flight/flightConfigs';
import type { Keyed } from '../../i18n/keyedError';
import type { ComponentFigures, StageFigures } from './rktExport';
import { loadSettings } from '../storage/settings';
import { collectNodes } from '../../tree/treeWalk';
import { notePartName } from './importNote';
import { decalFiles, decalPaths } from './ork/exportDecals';
import { getDecalImage } from '../storage/decalStore';

/** PNGs desktop's `GeneralRocketSaver` stores beside the design, for file browsers; it saves without them too. */
export interface OrkImages {
  /** The 3D side view with the design's figures: macOS QuickLook. */
  preview?: Uint8Array;
  /** 1024 px square, nose up-left, outlined: Explorer and Finder icons. */
  thumbnail?: Uint8Array;
  /** The parts' decal images, at the paths the design names them by. */
  decals?: { path: string; bytes: Uint8Array }[];
}

/** The decal images to pack, and the paths of those this browser no longer holds. */
export async function decalArchiveFiles(
  tree: RocketTree,
): Promise<{ files: { path: string; bytes: Uint8Array }[]; missing: string[] }> {
  const files: { path: string; bytes: Uint8Array }[] = [];
  const missing: string[] = [];
  for (const { hash, path } of decalFiles(decalPaths(tree))) {
    const image = await getDecalImage(hash);
    if (image) files.push({ path, bytes: image.bytes });
    else missing.push(path);
  }
  return { files, missing };
}

/** What the images are drawn from, read when the save began. */
export interface OrkImageSource {
  tree: RocketTree;
  config: FlightConfig;
  info: StaticInfo | null;
  name: string;
}

/** Draws the images; services and state cannot reach the 3D code, so the UI hands this in. */
export type OrkImageRenderer = (source: OrkImageSource) => Promise<OrkImages>;

export function orkArchive(input: OrkTreeExportInput, images: OrkImages = {}): Uint8Array {
  const xml = exportOrk(input);
  const files: Zippable = { 'rocket.ork': strToU8(xml) };
  // Desktop's order: the design, the preview, the thumbnail, then the curves. PNG is compressed already.
  if (images.preview?.length) files['preview.png'] = [images.preview, { level: 0 }];
  if (images.thumbnail?.length) files['thumbnail.png'] = [images.thumbnail, { level: 0 }];
  for (const d of images.decals ?? []) files[d.path] ??= d.bytes;
  // Desktop looks for curves at `thrustcurves/<digest>.rse`.
  for (const config of input.configs ?? []) {
    for (const m of Object.values(config.motors ?? {})) {
      if (m.embedded) files[m.embedded.path] ??= strToU8(m.embedded.text);
    }
  }
  return zipSync(files, { level: 6 });
}

/** Parts desktop has no element for: its `ComponentHandler` skips them, mass and all, when it opens the file. */
export function partsDesktopDrops(tree: RocketTree): (string | Keyed)[] {
  return collectNodes(tree.components, (n) => n.type === 'fairing').map(notePartName);
}

function orkBlob(input: OrkTreeExportInput, images?: OrkImages): Blob {
  return new Blob([orkArchive(input, images) as BlobPart], { type: 'application/vnd.openrocket.ork' });
}

export function downloadOrk(input: OrkTreeExportInput, images?: OrkImages): void {
  const withPrefs = { ...input, simPrefs: input.simPrefs ?? loadSettings().simulation };
  void saveBlob(orkBlob(withPrefs, images), exportFilename([input.name, 'design'], 'ork'));
}

export async function downloadRkt(
  name: string,
  tree: RocketTree,
  componentInfo?: ComponentFigures,
  stageFigures?: readonly StageFigures[],
): Promise<Keyed[]> {
  const { exportRkt } = await import('./rktExport');
  const { xml, skipped } = exportRkt(name, tree, componentInfo, stageFigures);
  await saveText(xml, exportFilename([name, 'design'], 'rkt'), 'application/xml');
  return skipped;
}
