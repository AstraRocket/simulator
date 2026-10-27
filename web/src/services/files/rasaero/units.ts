import { plainDecimal } from '../numberText';
import type { Keyed } from '../../../i18n/keyedError';

/**
 * RASAero's units and number formatting. Geometry in inches (× 39.37 from
 * meters), diameters not radii; angles degrees; altitudes feet; weights
 * pounds; speeds mph; pressure in-Hg.
 */

export const IN = 39.37; // inches per meter (desktop OPENROCKET_TO_RASAERO_LENGTH)
export const FT = 3.28084;
export const LB = 2.20462262;
export const MPH = 2.23694; // mph per m/s
export const INHG = 33.8639; // hPa per in-Hg

/** Four decimals, trailing zeros trimmed, never "-0"; a non-finite value is 0. */
export const fmt = (v: number): string => plainDecimal(v, 4, '0');

/**
 * The line sink, the running absolute location (nose tip origin, meters) and
 * the warning sink.
 */
export interface Cdx1Writer {
  lines: string[];
  locM: number;
  emit: (s: string) => void;
  /**
   * Keep a non-fatal note for the banner. A note already kept is not kept
   * twice, as desktop's WarningSet holds each warning once.
   */
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
