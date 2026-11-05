// iOS/iPadOS installed PWA: an `<a download>` blob silently does nothing, so the share sheet is used there.

import { loadSettings } from '../storage/settings';
import { isApplePhoneOrTablet } from '../app/device';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

function needsShareSheet(): boolean {
  return isApplePhoneOrTablet() && isStandalone();
}

function anchorDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously can cancel the download before the blob is read.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

type SavePicker = (options: {
  suggestedName: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;

function savePicker(): SavePicker | null {
  if (typeof window === 'undefined') return null;
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  return typeof picker === 'function' ? picker : null;
}

export function canAskWhereToSave(): boolean {
  return savePicker() !== null;
}

// False means fall back: the browser refuses a picker opened too long after the user's click.
async function pickAndSave(picker: SavePicker, blob: Blob, filename: string): Promise<boolean> {
  const ext = /\.([A-Za-z0-9]+)$/.exec(filename)?.[1];
  // The dialog wants a bare MIME type: `text/csv;charset=utf-8` is refused.
  const mime = (blob.type || 'application/octet-stream').split(';')[0]!.trim();
  try {
    const handle = await picker({
      suggestedName: filename,
      ...(ext ? { types: [{ description: ext.toUpperCase(), accept: { [mime]: [`.${ext}`] } }] } : {}),
    });
    const out = await handle.createWritable();
    await out.write(blob);
    await out.close();
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return true;
    return false;
  }
}

export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (needsShareSheet()) {
    try {
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  const picker = loadSettings().askWhereToSave ? savePicker() : null;
  if (picker && (await pickAndSave(picker, blob, filename))) return;
  anchorDownload(blob, filename);
}

const BOM = String.fromCharCode(0xfeff);

// Without a BOM, Excel on Windows reads a CSV as ANSI and garbles non-ASCII.
function textForSave(text: string, mime: string): string {
  const isCsv = mime.trim().toLowerCase().startsWith('text/csv');
  return isCsv && !text.startsWith(BOM) ? BOM + text : text;
}

export async function saveText(text: string, filename: string, mime = 'text/plain;charset=utf-8'): Promise<void> {
  await saveBlob(new Blob([textForSave(text, mime)], { type: mime }), filename);
}

// Filename first: a string payload type-checks in either position, so swapped arguments are not caught.
export function download(filename: string, data: BlobPart, mime = 'text/plain;charset=utf-8'): void {
  const part = typeof data === 'string' ? textForSave(data, mime) : data;
  void saveBlob(part instanceof Blob ? part : new Blob([part], { type: mime }), filename);
}

// Requires a surviving letter or digit: "///" would collapse to a truthy but useless "_".
export function safeFilename(name: string, fallback = 'rocket'): string {
  const cleaned = (name ?? '')
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}._-]+/gu, '_')
    .replace(/^\.+/, '');
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : fallback;
}

export function exportFilename(
  parts: readonly (string | null | undefined)[],
  ext: string,
  fallback = 'rocket',
): string {
  const kept = parts.map((p) => safeFilename(p ?? '', '')).filter(Boolean);
  return `${kept.length ? kept.join('-') : fallback}.${ext}`;
}
