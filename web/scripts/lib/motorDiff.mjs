// What changed between two motor catalogs: the one the data branch holds and
// the one a sync just built.
//
// The sync's publish step only knows whether the file changed. This says which
// motors: added, removed, and changed with the fields that moved. Motors are
// matched on their row key (lib/motorRowKey.mjs), which assertSane holds unique
// in every catalog sync-motors writes.

import { motorRowKey } from './motorRowKey.mjs';

/** Fields whose values are arrays or objects: reported as changed, not printed. */
const BULKY = {
  curves: 'thrust curves',
  cg: 'CG table',
  digests: 'OpenRocket digests',
};

/** Fields in the order a person reads a motor; anything else follows, sorted. */
const ORDER = [
  'class',
  'impulse',
  'avgThrust',
  'maxThrust',
  'burn',
  'mass',
  'propWeightG',
  'length',
  'delays',
  'type',
  'propInfo',
  'oop',
  'sparky',
  'noCurve',
  'curves',
  'cg',
  'digests',
];

/**
 * Flags motorRow writes only when true (`oop`, `sparky`, `noCurve`), so a
 * missing one means false: a motor going out of production is `oop no → yes`,
 * not `oop none → yes`.
 */
const FLAGS = new Set(['oop', 'sparky', 'noCurve']);
const value = (m, k) => (FLAGS.has(k) ? (m[k] ?? false) : m[k]);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** `Estes C6 (18 mm)`: the name a person looks a motor up by. */
function motorLabel(m) {
  return `${m.manufacturer} ${m.designation} (${m.diameter} mm${m.code ? `, ${m.code}` : ''})`;
}

/**
 * @param {ReadonlyArray<object>} before the published catalog
 * @param {ReadonlyArray<object>} after the catalog this sync built
 * @returns {{added: object[], removed: object[], changed: {motor: object, fields: {field: string, before: unknown, after: unknown}[]}[]}}
 */
export function diffMotors(before, after) {
  const old = new Map(before.map((m) => [motorRowKey(m), m]));
  const now = new Map(after.map((m) => [motorRowKey(m), m]));
  const added = after.filter((m) => !old.has(motorRowKey(m)));
  const removed = before.filter((m) => !now.has(motorRowKey(m)));
  const changed = [];
  for (const m of after) {
    const prev = old.get(motorRowKey(m));
    if (!prev) continue;
    const keys = [...new Set([...Object.keys(prev), ...Object.keys(m)])].sort((a, b) => {
      const ia = ORDER.indexOf(a);
      const ib = ORDER.indexOf(b);
      return (ia < 0 ? ORDER.length : ia) - (ib < 0 ? ORDER.length : ib) || (a < b ? -1 : a > b ? 1 : 0);
    });
    const fields = keys
      .filter((k) => !same(value(prev, k), value(m, k)))
      .map((k) => ({ field: k, before: value(prev, k), after: value(m, k) }));
    if (fields.length) changed.push({ motor: m, fields });
  }
  return { added, removed, changed };
}

/** True when the two catalogs hold the same motors with the same values. */
export const isEmptyDiff = (d) => !d.added.length && !d.removed.length && !d.changed.length;

/** `3 added, 1 removed, 7 changed`, or `no change`. */
export function motorDiffHeadline(d) {
  if (isEmptyDiff(d)) return 'no change';
  return `${d.added.length} added, ${d.removed.length} removed, ${d.changed.length} changed`;
}

const show = (v) => {
  if (v === undefined || v === null) return 'none';
  if (v === true) return 'yes';
  if (v === false) return 'no';
  return String(v);
};

/** One changed field, readable: `impulse 9.8 → 10.1`, `thrust curves 1 → 2`. */
export function describeField({ field, before, after }) {
  const bulky = BULKY[field];
  if (!bulky) return `${field} ${show(before)} → ${show(after)}`;
  const count = (v) => (Array.isArray(v) ? v.length : v == null ? 0 : Object.keys(v).length);
  if (before == null) return `${bulky} added`;
  if (after == null) return `${bulky} removed`;
  if (count(before) !== count(after)) return `${bulky} ${count(before)} → ${count(after)}`;
  return `${bulky} replaced`;
}

const cell = (s) => s.replaceAll('|', '\\|');

/**
 * The job summary section: a headline, then each list in a collapsed block.
 * Each list stops at `limit` rows, since a pinned OpenRocket bump can change
 * every motor's digests and a job summary is capped at 1 MiB.
 */
export function motorDiffMarkdown(d, { limit = 200 } = {}) {
  const lines = [`### Motors: ${motorDiffHeadline(d)}`, ''];
  if (isEmptyDiff(d)) return lines.join('\n');
  const block = (title, rows, header, toRow) => {
    if (!rows.length) return;
    lines.push(`<details><summary>${title} (${rows.length})</summary>`, '', header);
    for (const r of rows.slice(0, limit)) lines.push(toRow(r));
    if (rows.length > limit) lines.push('', `${rows.length - limit} more not shown.`);
    lines.push('', '</details>', '');
  };
  const motorRow = (m) => `| ${cell(motorLabel(m))} | ${m.class} | ${show(m.impulse)} | ${m.oop ? 'yes' : 'no'} |`;
  const motorHeader = '| Motor | Class | Impulse (N·s) | Out of production |\n| --- | --- | ---: | --- |';
  block('Added', d.added, motorHeader, motorRow);
  block('Removed', d.removed, motorHeader, motorRow);
  block(
    'Changed',
    d.changed,
    '| Motor | What changed |\n| --- | --- |',
    (c) => `| ${cell(motorLabel(c.motor))} | ${cell(c.fields.map(describeField).join('; '))} |`,
  );
  return lines.join('\n');
}
