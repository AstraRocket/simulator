import { plainDecimal } from '../numberText';
import type { Keyed } from '../../../i18n/keyedError';

// RASAero: inches (diameters, not radii), degrees, feet, pounds, mph, in-Hg.

export const IN = 39.37; // inches per meter (desktop OPENROCKET_TO_RASAERO_LENGTH)
export const FT = 3.28084;
export const LB = 2.20462262;
export const MPH = 2.23694; // mph per m/s

export const fmt = (v: number): string => plainDecimal(v, 4, '0');

export interface Cdx1Writer {
  lines: string[];
  /** Absolute from the nose tip (m). */
  locM: number;
  emit: (s: string) => void;
  warn: (k: Keyed) => void;
}

export function createCdx1Writer(warnings?: Keyed[]): Cdx1Writer {
  const lines: string[] = [];
  const seen = new Set<string>();
  return {
    lines,
    locM: 0,
    emit: (s) => lines.push(s),
    warn: (k) => {
      const id = JSON.stringify(k);
      if (seen.has(id)) return;
      seen.add(id);
      warnings?.push(k);
    },
  };
}
