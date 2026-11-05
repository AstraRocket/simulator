import { zipSync, strToU8 } from 'fflate';
import { exportOrk, type OrkTreeExportInput } from './orkFile';
import { saveBlob, exportFilename } from './saveFile';
import type { RocketTree } from '../../engine/openRocketEngine';
import type { Keyed } from '../../i18n/keyedError';
import type { ComponentFigures, StageFigures } from './rktExport';
import { loadSettings } from '../storage/settings';

export function orkArchive(input: OrkTreeExportInput): Uint8Array {
  const xml = exportOrk(input);
  const files: Record<string, Uint8Array> = { 'rocket.ork': strToU8(xml) };
  // Desktop looks for curves at `thrustcurves/<digest>.rse`.
  for (const config of input.configs ?? []) {
    for (const m of Object.values(config.motors ?? {})) {
      if (m.embedded) files[m.embedded.path] ??= strToU8(m.embedded.text);
    }
  }
  return zipSync(files, { level: 6 });
}

function orkBlob(input: OrkTreeExportInput): Blob {
  return new Blob([orkArchive(input) as BlobPart], { type: 'application/vnd.openrocket.ork' });
}

export function downloadOrk(input: OrkTreeExportInput): void {
  const withPrefs = { ...input, simPrefs: input.simPrefs ?? loadSettings().simulation };
  void saveBlob(orkBlob(withPrefs), exportFilename([input.name, 'design'], 'ork'));
}

export async function downloadRkt(
  name: string,
  tree: RocketTree,
  componentInfo?: ComponentFigures,
  stageFigures?: readonly StageFigures[],
): Promise<Keyed[]> {
  const { exportRkt } = await import('./rktExport');
  const { xml, skipped } = exportRkt(name, tree, componentInfo, stageFigures);
  await saveBlob(new Blob([xml], { type: 'application/xml' }), exportFilename([name, 'design'], 'rkt'));
  return skipped;
}
