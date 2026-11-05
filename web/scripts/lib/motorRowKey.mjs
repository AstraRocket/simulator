// Must match `keyOf` in src/services/motors/motorKey.ts (the selection identity).

/** @param {{manufacturer: string, designation: string, diameter: number, code?: string}} m */
export const motorRowKey = (m) => `${m.manufacturer}|${m.designation}|${m.diameter}|${m.code ?? ''}`;

/**
 * @param {ReadonlyArray<{manufacturer: string, designation: string, diameter: number, code?: string}>} motors
 * @returns {string[]}
 */
export function collidingRowKeys(motors) {
  const count = new Map();
  for (const m of motors) {
    const k = motorRowKey(m);
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  return [...count.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}
