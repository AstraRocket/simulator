export const roundTo = (x: number, places: number): number => Math.round(x * 10 ** places) / 10 ** places;

/** Not interchangeable with {@link roundTo}: differs on binary halfway values, matching `toFixed`. */
export const roundFixed = (x: number, places: number): number => Number(x.toFixed(places));

export const trimFloatNoise = (v: number): number => roundFixed(v, 6);

export const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** `v` when it is a finite number, else `fallback`: each caller picks its own (null, undefined, 0). */
export const finiteOr = <T>(v: unknown, fallback: T): number | T => (isFiniteNumber(v) ? v : fallback);

export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
