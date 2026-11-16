import type { OrkImportResult } from './orkTypes';
import { importOrk } from './orkFile';
import { importRkt } from './rktImport';
import { assertImportSize, decodeFileText } from './decodeText';
import { KeyedError } from '../../i18n/keyedError';
import { isGzip, isZip, unpackOrk } from './ork/importUnpack';
import { checkBuildSize } from './ork/importLimits';

const SNIFF_BYTES = 512;

export type DesignFormat = 'ork' | 'rkt';

// Matches the root tag, not the word: "RockSim" appears in many `.ork` files.
export function sniffDesignFormat(data: ArrayBuffer | string): DesignFormat | null {
  if (typeof data !== 'string') {
    const bytes = new Uint8Array(data);
    if (isZip(bytes) || isGzip(bytes)) {
      // `GeneralRocketLoader` goes by what is inside. `importOrk` words the refusal of a bad archive.
      try {
        return /<RockSimDocument[\s>]/.test(unpackOrk(data).xml.slice(0, SNIFF_BYTES)) ? 'rkt' : 'ork';
      } catch {
        return 'ork';
      }
    }
    data = decodeFileText(bytes.subarray(0, SNIFF_BYTES));
  }
  const head = data.slice(0, SNIFF_BYTES);
  if (/<RockSimDocument[\s>]/.test(head)) return 'rkt';
  if (/<openrocket[\s>]/.test(head)) return 'ork';
  return null;
}

export function parseDesignFile(data: ArrayBuffer | string): OrkImportResult {
  // Bytes are capped as they are decoded.
  if (typeof data === 'string') assertImportSize(data.length);
  const format = sniffDesignFormat(data);
  if (!format) throw new KeyedError('errors.file.notDesign');
  const res = format === 'rkt' ? importRkt(data) : importOrk(data);
  checkBuildSize(res.tree.components, `.${format}`);
  return { ...res, format };
}
