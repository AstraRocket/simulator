import { lenM, num, str } from './orcText.mjs';

/** A parachute row holds only its canopy, so its key also reads lines, packing and materials from `block`. */
function partRowKey(row, block = '') {
  if (row.type !== 'parachute') return JSON.stringify(row);
  return JSON.stringify([
    row,
    num(block, 'LineCount'),
    lenM(block, 'LineLength'),
    lenM(block, 'PackedLength'),
    lenM(block, 'PackedDiameter'),
    str(block, 'Material'),
    str(block, 'LineMaterial'),
  ]);
}

export function uniqueRows() {
  const rows = [];
  const seen = new Set();
  const push = (row, block) => {
    const key = partRowKey(row, block);
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };
  return { rows, push };
}
