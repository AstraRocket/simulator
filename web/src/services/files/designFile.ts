import type { OrkImportResult } from './orkTypes';
import { importOrk } from './orkFile';
import { importRkt } from './rktImport';
import { assertImportSize, decodeFileText } from './decodeText';
import { KeyedError } from '../../i18n/keyedError';
import { isGzip, isZip } from './ork/importUnpack';

const SNIFF_BYTES = 512;

export type DesignFormat = 'ork' | 'rkt';

// Matches the root tag, not the word: "RockSim" appears in many `.ork` files.
export function sniffDesignFormat(data: ArrayBuffer | string): DesignFormat | null {
  if (typeof data !== 'string') {
    const bytes = new Uint8Array(data);
    if (isZip(bytes)) return 'ork';
    // Older OpenRocket gzipped `.ork`; RockSim never compresses.
    if (isGzip(bytes)) return 'ork';
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
  if (format === 'rkt') return { ...importRkt(data), format };
  if (format === 'ork') return { ...importOrk(data), format };
  throw new KeyedError('errors.file.notDesign');
}
