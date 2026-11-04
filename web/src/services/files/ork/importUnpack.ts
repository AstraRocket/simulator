import { Gunzip, Inflate, Unzip, UnzipPassThrough, strFromU8, type UnzipDecoder } from 'fflate';
import { decodeFileText } from '../decodeText';
import { parseXmlText } from '../xmlUtil';
import {
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_ENTRY_BYTES,
  MAX_ARCHIVE_TOTAL_BYTES,
  MAX_GZIP_MEMBERS,
} from './importLimits';
import { KeyedError } from '../../../i18n/keyedError';

export type OrkArchive = {
  xml: string;
  motorFiles: string[];
  dropped: string[];
};

export const isGzip = (bytes: Uint8Array): boolean => bytes[0] === 0x1f && bytes[1] === 0x8b;

export const isZip = (bytes: Uint8Array): boolean => bytes[0] === 0x50 && bytes[1] === 0x4b;

/** fflate inflates all it is given before reporting output; at ~1032:1 a slice yields ~1 MiB. */
const INFLATE_SLICE = 1024;

function feed(push: (chunk: Uint8Array, final: boolean) => void, bytes: Uint8Array): void {
  if (bytes.length === 0) {
    push(bytes, true);
    return;
  }
  for (let at = 0; at < bytes.length; at += INFLATE_SLICE) {
    const end = Math.min(at + INFLATE_SLICE, bytes.length);
    push(bytes.subarray(at, end), end === bytes.length);
  }
}

function joined(chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

// fflate recopies unconsumed input on every push (quadratic); valid DEFLATE holds back at most 65,535 bytes plus framing.
const MAX_INPUT_WITHOUT_OUTPUT = 128 * 1024;

function stallGuard(push: (chunk: Uint8Array, final: boolean) => void) {
  let sinceOutput = 0;
  return {
    produced: () => {
      sinceOutput = 0;
    },
    push: (chunk: Uint8Array, final: boolean) => {
      sinceOutput += chunk.length;
      if (sinceOutput > MAX_INPUT_WITHOUT_OUTPUT) throw new KeyedError('errors.file.archiveCorrupt');
      push(chunk, final);
    },
  };
}

function gunzipCapped(bytes: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const stream = new Gunzip((chunk) => {
    if (chunk.length) guard.produced();
    total += chunk.length;
    if (total > MAX_ARCHIVE_ENTRY_BYTES) throw new KeyedError('errors.file.archiveTooLarge');
    chunks.push(chunk);
  });
  let members = 1;
  stream.onmember = () => {
    if (++members > MAX_GZIP_MEMBERS) throw new KeyedError('errors.file.archiveTooManyEntries');
  };
  const guard = stallGuard((chunk, final) => stream.push(chunk, final));
  feed(guard.push, bytes);
  return joined(chunks);
}

class GuardedInflate implements UnzipDecoder {
  static compression = 8;
  ondata: UnzipDecoder['ondata'] = () => {};
  private readonly inflate = new Inflate((data, final) => {
    if (data.length) this.guard.produced();
    this.ondata(null, data, final);
  });
  private readonly guard = stallGuard((chunk, final) => this.inflate.push(chunk, final));
  push(chunk: Uint8Array, final: boolean): void {
    this.guard.push(chunk, final);
  }
}

/**
 * Caps count inflated bytes, not declared sizes. An unsigned data descriptor (APPNOTE 4.3.9.3)
 * throws fflate's streaming reader off, so a failed stream is reread via the central directory.
 */
function unzipCapped(bytes: Uint8Array): Map<string, Uint8Array> {
  try {
    return unzipStreaming(bytes);
  } catch (e) {
    if (e instanceof KeyedError && e.key !== 'errors.file.archiveCorrupt') throw e;
  }
  try {
    return unzipFromDirectory(bytes);
  } catch (e) {
    if (e instanceof KeyedError) throw e;
    throw new KeyedError('errors.file.archiveCorrupt');
  }
}

function memberCounter() {
  let entryCount = 0;
  let total = 0;
  return {
    entry: () => {
      if (++entryCount > MAX_ARCHIVE_ENTRIES) throw new KeyedError('errors.file.archiveTooManyEntries');
      let size = 0;
      return (data: Uint8Array) => {
        size += data.length;
        total += data.length;
        if (size > MAX_ARCHIVE_ENTRY_BYTES || total > MAX_ARCHIVE_TOTAL_BYTES) {
          throw new KeyedError('errors.file.archiveTooLarge');
        }
      };
    },
  };
}

function unzipStreaming(bytes: Uint8Array): Map<string, Uint8Array> {
  const members = new Map<string, Uint8Array>();
  const counter = memberCounter();
  const unzip = new Unzip((file) => {
    const count = counter.entry();
    const chunks: Uint8Array[] = [];
    file.ondata = (err, data, final) => {
      if (err) throw err;
      count(data);
      chunks.push(data);
      if (final) members.set(file.name, joined(chunks));
    };
    file.start();
  });
  unzip.register(UnzipPassThrough);
  unzip.register(GuardedInflate);
  try {
    feed((chunk, final) => unzip.push(chunk, final), bytes);
  } catch (e) {
    if (e instanceof KeyedError) throw e;
    throw new KeyedError('errors.file.archiveCorrupt');
  }
  return members;
}

const EOCD_SIG = 0x06054b50;
const EOCD_SIZE = 22;
const MAX_COMMENT = 0xffff;

function unzipFromDirectory(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const corrupt = () => new KeyedError('errors.file.archiveCorrupt');
  let eocd = -1;
  for (let at = bytes.length - EOCD_SIZE; at >= Math.max(0, bytes.length - EOCD_SIZE - MAX_COMMENT); at--) {
    if (view.getUint32(at, true) === EOCD_SIG) {
      eocd = at;
      break;
    }
  }
  if (eocd < 0) throw corrupt();
  const count = view.getUint16(eocd + 10, true);
  if (count > MAX_ARCHIVE_ENTRIES) throw new KeyedError('errors.file.archiveTooManyEntries');
  const members = new Map<string, Uint8Array>();
  const counter = memberCounter();
  let at = view.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw corrupt();
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const csize = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const next = at + 46 + nameLen + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    if (next > bytes.length || local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) {
      throw corrupt();
    }
    const name = strFromU8(bytes.subarray(at + 46, at + 46 + nameLen), (flags & 0x800) === 0);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + csize > bytes.length) throw corrupt();
    const data = bytes.subarray(start, start + csize);
    const tally = counter.entry();
    const chunks: Uint8Array[] = [];
    if (method === 0) {
      tally(data);
      chunks.push(data);
    } else if (method === 8) {
      let ended = false;
      const inflate = new GuardedInflate();
      inflate.ondata = (err, out, final) => {
        if (err) throw err;
        tally(out);
        chunks.push(out);
        if (final) ended = true;
      };
      feed((chunk, final) => inflate.push(chunk, final), data);
      if (!ended) throw corrupt();
    } else throw corrupt();
    members.set(name, joined(chunks));
    at = next;
  }
  return members;
}

/** Only one gzip layer is unwrapped, as `GeneralRocketLoader.loadStep1` does. */
export function unpackOrk(data: ArrayBuffer | string, gunzipped = false): OrkArchive {
  if (typeof data === 'string') return { xml: data, motorFiles: [], dropped: [] };
  const bytes = new Uint8Array(data);
  if (!gunzipped && isGzip(bytes)) {
    let inner: Uint8Array;
    try {
      inner = gunzipCapped(bytes);
    } catch (e) {
      if (e instanceof KeyedError) throw e;
      throw new KeyedError('errors.file.archiveCorrupt');
    }
    return unpackOrk(inner.buffer.slice(inner.byteOffset, inner.byteOffset + inner.byteLength) as ArrayBuffer, true);
  }
  if (isZip(bytes)) {
    const entries = unzipCapped(bytes);
    const names = [...entries.keys()];
    const entryName = names.find((n) => n.endsWith('.ork')) ?? names[0];
    if (!entryName) throw new KeyedError('errors.file.archiveEmpty');
    const motorFiles: string[] = [];
    const dropped: string[] = [];
    for (const name of names) {
      if (name === entryName) continue;
      // Any `.rse`: the `thrustcurves/` folder is only a convention.
      if (name.toLowerCase().endsWith('.rse')) motorFiles.push(decodeFileText(entries.get(name)!));
      else if (name !== 'preview.png') dropped.push(name);
    }
    return { xml: decodeFileText(entries.get(entryName)!), motorFiles, dropped };
  }
  return { xml: decodeFileText(bytes), motorFiles: [], dropped: [] };
}

export function parseOrkXml(xml: string, format: '.ork' | '.rkt' = '.ork'): Document {
  // OpenRocket writes a single-quoted XML declaration; some parsers reject it.
  if (xml.charCodeAt(0) === 0xfeff) xml = xml.slice(1); // strip optional BOM
  xml = xml.replace(/^\s*<\?xml[^?]*\?>/, '');
  return parseXmlText(xml, format);
}
