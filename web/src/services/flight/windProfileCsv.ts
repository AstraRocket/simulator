import type { WindLevel } from '../design/orkTree';
import { norm360 } from './groundTrack';

// Mirrors `MultiLevelPinkNoiseWindModel.importLevelsFromCSV`: fixed units (m, m/s, degrees), not display units.

export class WindProfileCsvError extends Error {
  // i18n key under `windProfile.csv`.
  readonly key: string;
  readonly line?: number;

  constructor(key: string, line?: number) {
    super(key);
    this.name = 'WindProfileCsvError';
    this.key = key;
    this.line = line;
  }
}

const ALIASES: Record<keyof Omit<WindLevel, 'altitudeM' | 'directionDeg'> | 'altitude' | 'direction', string[]> = {
  altitude: ['altitude', 'alt', 'altitudemsl', 'altitudeagl', 'altitudem', 'altitudemslm', 'altitudeaglm', 'height'],
  speed: ['speed', 'windspeed', 'velocity', 'speedms', 'windspeedms'],
  direction: ['direction', 'dir', 'heading', 'winddirection', 'directiondeg', 'headingdeg'],
  stddev: ['stddev', 'standarddeviation', 'deviation', 'sd', 'sigma', 'stddevms'],
};

// Spreadsheets quote headers like `"altitude (m)"`.
const unquote = (s: string) => {
  const t = s.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/""/g, '"') : t;
};

// Letters and digits only, so `speed (m/s)` and `wind-speed_m/s` both read as `speedms`.
const norm = (h: string) =>
  unquote(h)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

function columnIndex(headers: string[], key: keyof typeof ALIASES): number {
  const names = ALIASES[key];
  return headers.findIndex((h) => names.includes(norm(h)));
}

export type WindProfileCsvResult = WindLevel[] & { reference?: 'msl' | 'agl' };

function altitudeReference(header: string): 'msl' | 'agl' | undefined {
  const n = norm(header);
  if (n.includes('agl')) return 'agl';
  if (n.includes('msl')) return 'msl';
  return undefined;
}

// As the desktop's `extractDouble`: falls back to the last comma as decimal point ("5,5").
function decimal(text: string): number {
  const v = Number(text);
  if (Number.isFinite(v)) return v;
  const comma = text.lastIndexOf(',');
  return comma < 0 ? NaN : Number(`${text.slice(0, comma)}.${text.slice(comma + 1)}`);
}

function detectSeparator(headerLine: string): string {
  const counts = [',', ';', '\t'].map((sep) => [sep, headerLine.split(sep).length - 1] as const);
  const best = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
  return best[1] > 0 ? best[0] : ',';
}

export function parseWindProfileCsv(text: string): WindProfileCsvResult {
  // A spreadsheet BOM would otherwise stop the first header matching.
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim() !== '');
  if (headerIdx < 0) throw new WindProfileCsvError('emptyFile');

  const sep = detectSeparator(lines[headerIdx]!);
  const headers = lines[headerIdx]!.split(sep);
  const altIdx = columnIndex(headers, 'altitude');
  const speedIdx = columnIndex(headers, 'speed');
  const dirIdx = columnIndex(headers, 'direction');
  const sdIdx = columnIndex(headers, 'stddev');
  if (altIdx < 0 || speedIdx < 0 || dirIdx < 0) throw new WindProfileCsvError('missingColumns');

  const need = Math.max(altIdx, speedIdx, dirIdx, sdIdx);
  const levels: WindProfileCsvResult = [];
  // Dropping an AGL reference would import the levels as MSL; the caller applies it.
  const reference = altitudeReference(headers[altIdx]!);
  if (reference) levels.reference = reference;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim() === '') continue;
    const cells = raw.split(sep);
    if (need >= cells.length) throw new WindProfileCsvError('shortRow', i + 1);

    const cell = (idx: number): number => {
      const text = unquote(cells[idx]!);
      // `Number('')` is 0, so a blank would otherwise import as a real 0.
      if (text === '') throw new WindProfileCsvError('badNumber', i + 1);
      const v = decimal(text);
      if (!Number.isFinite(v)) throw new WindProfileCsvError('badNumber', i + 1);
      return v;
    };

    const sdCell = sdIdx >= 0 ? unquote(cells[sdIdx]!) : '';
    // A negative speed is a wind from the opposite heading, as PinkNoiseWindModel.setAverage stores it.
    const speed = cell(speedIdx);
    const directionDeg = cell(dirIdx);
    levels.push({
      altitudeM: cell(altIdx),
      speed: Math.abs(speed),
      directionDeg: speed < 0 ? norm360(directionDeg + 180) : directionDeg,
      // As `PinkNoiseWindModel.setStandardDeviation` floors it.
      stddev: sdCell === '' ? 0 : Math.max(cell(sdIdx), 0),
    });
  }

  if (!levels.length) throw new WindProfileCsvError('noData');
  return levels.sort((a, b) => a.altitudeM - b.altitudeM);
}
