// cspell:ignore Lóki -- a maker name with an accent, the case this reads
import { MAX_ARCHIVE_ENTRY_BYTES } from './ork/importLimits';
import { KeyedError } from '../../i18n/keyedError';

export const MAX_IMPORT_FILE_BYTES = MAX_ARCHIVE_ENTRY_BYTES;

export function assertImportSize(size: number): void {
  if (size > MAX_IMPORT_FILE_BYTES) {
    throw new KeyedError('errors.file.tooLarge', { size: MAX_IMPORT_FILE_BYTES / (1024 * 1024) });
  }
}

function encodingOf(bytes: Uint8Array): string {
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
    // No BOM: '<' is 3C 00 or 00 3C, and UTF-8 text has no NUL in its first two bytes.
    if (bytes[0] === 0x3c && bytes[1] === 0x00) return 'utf-16le';
    if (bytes[0] === 0x00 && bytes[1] === 0x3c) return 'utf-16be';
  }
  return declaredEncoding(bytes) ?? 'utf-8';
}

const DECLARED = /^\s*<\?xml(?=\s)[^>]*?\sencoding\s*=\s*["']([A-Za-z0-9._:-]+)["']/;

// A UTF-16 label here contradicts the bytes (handled above), so it is ignored.
function declaredEncoding(bytes: Uint8Array): string | undefined {
  const head = String.fromCharCode(...bytes.subarray(0, 256));
  const label = DECLARED.exec(head)?.[1];
  if (!label) return undefined;
  try {
    const encoding = new TextDecoder(label).encoding;
    return encoding.startsWith('utf-16') ? undefined : encoding;
  } catch {
    return undefined;
  }
}

// Undeclared non-UTF-8 falls back to windows-1252, as desktop reads RASP (`RASPMotorLoader.CHARSET_NAME`).
export function decodeFileText(bytes: Uint8Array): string {
  assertImportSize(bytes.byteLength);
  const encoding = encodingOf(bytes);
  if (encoding !== 'utf-8' || declaredEncoding(bytes)) return new TextDecoder(encoding).decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Use instead of `File.text()`, which reads UTF-8 only. */
export async function readFileText(file: Blob): Promise<string> {
  assertImportSize(file.size);
  return decodeFileText(new Uint8Array(await file.arrayBuffer()));
}
