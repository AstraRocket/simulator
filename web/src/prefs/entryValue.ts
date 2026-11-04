import { type Quantity, uiToSi } from './units';

// Check finiteness after every conversion: 1e306 g/cm3 is 1e309 kg/m3, which the .ork reader takes back as 0.

export const SI_LIMITS: Partial<Record<Quantity, { min?: number; max?: number }>> = {
  /** kg/m3. */
  density: { max: 30_000 },
};

/** `null` means do not store: the box keeps its draft text rather than snapping to zero. */
export function clampEntry(n: number | null | undefined, min?: number, max?: number): number | null {
  // `Number.isFinite`, not `!isNaN`: Infinity passes a NaN check.
  if (n == null || !Number.isFinite(n)) return null;
  let v = n;
  if (min != null && v < min) v = min;
  if (max != null && v > max) v = max;
  return v;
}

/** jsdom never delivers "1e999" to a number input, but a browser does, so overflow is tested here. */
export function parseEntry(raw: string, min?: number, max?: number): number | null {
  if (raw.trim() === '') return null;
  return clampEntry(parseFloat(raw), min, max);
}

export function siEntry(
  quantity: Quantity,
  symbol: string,
  ui: number | null | undefined,
  then?: (si: number) => number,
): number | null {
  if (ui == null || !Number.isFinite(ui)) return null;
  const limit = SI_LIMITS[quantity];
  const si = clampEntry(uiToSi(quantity, symbol, ui), limit?.min, limit?.max);
  if (si === null) return null;
  return then ? clampEntry(then(si)) : si;
}

export interface SiConverter {
  toSi: (ui: number | null | undefined, then?: (si: number) => number) => number | null;
}

/** Blank commits `null` (clearing is a real edit); a refused value skips the callback. */
export function onSi(
  fu: SiConverter,
  commit: (si: number | null) => void,
  then?: (si: number) => number,
): (ui: number | null) => void {
  return (ui) => {
    if (ui == null) {
      commit(null);
      return;
    }
    const si = fu.toSi(ui, then);
    if (si === null) return;
    commit(si);
  };
}
