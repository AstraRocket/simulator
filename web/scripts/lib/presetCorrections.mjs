// Unit slips and copied placeholder values in the source parts files. Desktop flies them as written; the catalog does not.
// Each entry states the value it replaces, so a source that fixes it fails the sync and the entry goes.
// A `to` of undefined removes the field.

const STREAMER_PAPER = 'Paper SURFACE is 90 in fliskits-legacy.orc, a g/m² paper weight (an STD-660 weighs 20.9 kg)';
const TAC_NYLON = 'Rip stop nylon is labeled g/m² in giantleaprocketry.orc for a kg/m² value (1.9 oz/yd²)';
const BMS_NOSE_BLOCK =
  'BMS.ORC gives NB nose block diameters in inches labeled mm (an NB80-4 is 2.558 mm across); the BalsaMachining site’s CONES1.asp lists the inches. NB20-2 also repeats NB10’s 0.422 in. for BT-20’s 0.710 in.';
const QUEST_OUNCE =
  'Quest-legacy.orc gives these paper couplers exactly one ounce, a placeholder: the stated size at desktop’s own Kraft phenolic density weighs about 3 g';
/** Desktop's catalogs give "Kraft phenolic" this density where they state it; Quest-legacy.orc names the material with no <Material> block. */
const KRAFT_PHENOLIC = 958.70503449;

/** @type {{ type: string, mfr: string, partNo: string, field: string, from: number, to: number | undefined, why: string }[]} */
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
  ...[
    ['NB20-2', 0.000422, 0.018034],
    ['NB50-2', 0.00095, 0.02413],
    ['NB55-2', 0.001283, 0.0325882],
    ['NB55-3', 0.001283, 0.0325882],
    ['NB60-4', 0.001595, 0.040513],
    ['NB70-4', 0.00218, 0.055372],
    ['NB80-4', 0.002558, 0.0649732],
  ].map(([partNo, from, to]) => ({
    type: 'bulkhead',
    mfr: 'BalsaMachining',
    partNo: String(partNo),
    field: 'outerDiameter',
    from: Number(from),
    to: Number(to),
    why: BMS_NOSE_BLOCK,
  })),
  ...[
    ['10100', 9319.876229260268],
    ['10104', 8343.548589122256],
  ].flatMap(([partNo, density]) => [
    {
      type: 'tubecoupler',
      mfr: 'Quest',
      partNo: String(partNo),
      field: 'materialDensity',
      from: Number(density),
      to: KRAFT_PHENOLIC,
      why: QUEST_OUNCE,
    },
    {
      type: 'tubecoupler',
      mfr: 'Quest',
      partNo: String(partNo),
      field: 'mass',
      from: 0.0283495231,
      to: undefined,
      why: QUEST_OUNCE,
    },
  ]),
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
      if (c.to === undefined ? value === undefined : typeof value === 'number' && same(value, c.to)) continue;
      if (typeof value !== 'number' || !same(value, c.from)) {
        stale.push(`${label}: holds ${value}, not ${c.from}`);
        continue;
      }
      if (c.to === undefined) delete row[c.field];
      else row[c.field] = c.to;
      corrected++;
    }
  }
  if (stale.length) {
    throw new Error(`preset corrections no longer match the source, remove or update them: ${stale.join('; ')}`);
  }
  return corrected;
}
