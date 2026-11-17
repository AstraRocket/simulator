// Unit slips in the source parts files. Desktop flies them as written; the catalog does not.
// Each entry states the value it replaces, so a source that fixes it fails the sync and the entry goes.

const STREAMER_PAPER = 'Paper SURFACE is 90 in fliskits-legacy.orc, a g/m² paper weight (an STD-660 weighs 20.9 kg)';
const TAC_NYLON = 'Rip stop nylon is labeled g/m² in giantleaprocketry.orc for a kg/m² value (1.9 oz/yd²)';

/** @type {{ type: string, mfr: string, partNo: string, field: string, from: number, to: number, why: string }[]} */
export const PRESET_CORRECTIONS = [
  ...['STC-2-36', 'STD-440', 'STD-660'].map((partNo) => ({
    type: 'streamer',
    mfr: 'FlisKits',
    partNo,
    field: 'materialDensity',
    from: 90,
    to: 0.09,
    why: STREAMER_PAPER,
  })),
  ...['TAC-24', 'TAC-36', 'TAC-48', 'TAC-60', 'TAC-72', 'TAC-84'].map((partNo) => ({
    type: 'parachute',
    mfr: 'Giant Leap',
    partNo,
    field: 'materialDensity',
    from: 0.00006685,
    to: 0.06685,
    why: TAC_NYLON,
  })),
];

const same = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));

/**
 * Corrects the rows in place. Throws, naming the entries, when one finds no row or a row no longer holds `from`.
 *
 * @param {Record<string, unknown>[]} components
 * @param {typeof PRESET_CORRECTIONS} corrections
 * @returns {number} rows corrected
 */
export function applyPresetCorrections(components, corrections = PRESET_CORRECTIONS) {
  const stale = [];
  let corrected = 0;
  for (const c of corrections) {
    const rows = components.filter((r) => r.type === c.type && r.mfr === c.mfr && r.partNo === c.partNo);
    const label = `${c.type} ${c.mfr} ${c.partNo} ${c.field}`;
    if (!rows.length) {
      stale.push(`${label}: no such part`);
      continue;
    }
    for (const row of rows) {
      const value = row[c.field];
      // A rerun on an unstaged catalog meets rows this already corrected.
      if (typeof value === 'number' && same(value, c.to)) continue;
      if (typeof value !== 'number' || !same(value, c.from)) {
        stale.push(`${label}: holds ${value}, not ${c.from}`);
        continue;
      }
      row[c.field] = c.to;
      corrected++;
    }
  }
  if (stale.length) {
    throw new Error(`preset corrections no longer match the source, remove or update them: ${stale.join('; ')}`);
  }
  return corrected;
}
