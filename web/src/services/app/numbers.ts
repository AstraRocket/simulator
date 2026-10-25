/** `x` rounded to `places` decimal places, as a number. */
export const roundTo = (x: number, places: number): number => Math.round(x * 10 ** places) / 10 ** places;

/**
 * `x` rounded to `places` the way `toFixed` rounds, as a number. It differs
 * from {@link roundTo} only on a binary halfway value; use it where a figure
 * has to match what `toFixed` prints (an axis tick, a file value a golden pins).
 */
export const roundFixed = (x: number, places: number): number => Number(x.toFixed(places));

/** `v` with float noise trimmed (0.30000000000000004 back to 0.3), for a number shown in an entry box. */
export const trimFloatNoise = (v: number): number => roundFixed(v, 6);

/** A real number: of type number, and neither NaN nor infinite. */
export const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A plain JSON object: not null and not an array, so reading a property off it cannot throw. */
export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
