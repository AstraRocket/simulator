// Healthy refreshes give every part and about 89% of motors; broken ones give 0%.

const PART_FLOOR = 0.9;
const PART_TYPE_FLOOR = 0.8;
const MOTOR_FLOOR = 0.8;
// Smaller part types are not held to a floor: one part moves 8 rows by 12%.
export const MIN_ROWS = 50;

const share = (n, of) => (of ? n / of : 0);
const pct = (x) => `${(x * 100).toFixed(1)}%`;

function partCoverage(components) {
  const byType = new Map();
  for (const row of components) {
    const t = byType.get(row.type) ?? { rows: 0, digests: 0 };
    t.rows++;
    if (row.digest) t.digests++;
    byType.set(row.type, t);
  }
  const digests = components.filter((c) => c.digest).length;
  return { rows: components.length, digests, byType };
}

function motorCoverage(motors) {
  return { rows: motors.length, digests: motors.filter((m) => m.digests?.length).length };
}

function sharedDigests(components) {
  const rows = new Map();
  for (const row of components) {
    if (!row.digest) continue;
    if (!rows.has(row.digest)) rows.set(row.digest, []);
    rows.get(row.digest).push(row);
  }
  return [...rows].filter(([, r]) => r.length > 1);
}

const rowName = (row) => [row.type, row.mfr, row.partNo ?? row.desc].filter(Boolean).join(' ');

export function partProblems(components) {
  const c = partCoverage(components);
  const problems = [];
  for (const [digest, rows] of sharedDigests(components))
    problems.push(`digest ${digest} is carried by ${rows.length} rows (${rows.map(rowName).join('; ')})`);
  if (share(c.digests, c.rows) < PART_FLOOR)
    problems.push(
      `parts: ${c.digests} of ${c.rows} carry a digest (${pct(share(c.digests, c.rows))}, floor ${pct(PART_FLOOR)})`,
    );
  for (const [type, t] of c.byType) {
    if (t.rows >= MIN_ROWS && share(t.digests, t.rows) < PART_TYPE_FLOOR)
      problems.push(
        `${type}: ${t.digests} of ${t.rows} carry a digest (${pct(share(t.digests, t.rows))}, floor ${pct(PART_TYPE_FLOOR)})`,
      );
  }
  return problems;
}

export function motorProblems(motors) {
  const c = motorCoverage(motors);
  return share(c.digests, c.rows) < MOTOR_FLOOR
    ? [`motors: ${c.digests} of ${c.rows} carry a digest (${pct(share(c.digests, c.rows))}, floor ${pct(MOTOR_FLOOR)})`]
    : [];
}

export function coverageTable(components, motors) {
  const lines = ['| Catalog | Rows | With digest | Share |', '|---|---:|---:|---:|'];
  if (components) {
    const c = partCoverage(components);
    for (const [type, t] of [...c.byType].sort(([a], [b]) => (a < b ? -1 : 1)))
      lines.push(`| ${type} | ${t.rows} | ${t.digests} | ${pct(share(t.digests, t.rows))} |`);
    lines.push(`| **all parts** | ${c.rows} | ${c.digests} | ${pct(share(c.digests, c.rows))} |`);
  }
  if (motors) {
    const m = motorCoverage(motors);
    lines.push(`| **motors** | ${m.rows} | ${m.digests} | ${pct(share(m.digests, m.rows))} |`);
  }
  return lines.join('\n');
}

/**
 * Keys can repeat (same part number, different sizes), so digests are counted per key.
 *
 * @param {{ key: string, digested: boolean }[]} previous the catalog this run is held to
 * @param {{ key: string, digested: boolean }[]} current the catalog this run would write
 * @returns {{ lost: string[], gone: string[] }}
 */
export function digestChanges(previous, current) {
  const tally = (rows) => {
    const byKey = new Map();
    for (const { key, digested } of rows) {
      const t = byKey.get(key) ?? { rows: 0, digests: 0 };
      t.rows++;
      if (digested) t.digests++;
      byKey.set(key, t);
    }
    return byKey;
  };
  const before = tally(previous);
  const after = tally(current);
  const lost = [];
  const gone = [];
  for (const [k, b] of before) {
    if (!b.digests) continue;
    const a = after.get(k) ?? { rows: 0, digests: 0 };
    // Rows that are gone account for up to that many of the missing digests.
    const kept = Math.min(b.digests, a.rows);
    if (a.digests < kept) lost.push(k);
    if (kept < b.digests) gone.push(k);
  }
  return { lost: lost.sort(), gone: gone.sort() };
}

/**
 * @param {{ digest: string, label: string }[]} presets every preset the build holds
 * @param {{ digest?: string }[]} components the catalog this run would write
 * @returns {string[]} the labels of the presets no row carries, sorted
 */
export function presetsWithoutRow(presets, components) {
  const carried = new Set(components.map((c) => c.digest).filter(Boolean));
  return presets
    .filter((p) => !carried.has(p.digest))
    .map((p) => p.label)
    .sort();
}

/**
 * @param {string} title what the rows are ("Motors", "Parts")
 * @param {string[]} gone row keys, as `digestChanges` returns them
 */
export function goneSection(title, gone) {
  if (!gone.length) return '';
  return [
    `### ${title} no longer in the source`,
    '',
    `${gone.length} row keys carried a digest in the previous catalog and are not in this one:`,
    '',
    ...gone.map((k) => `- \`${k}\``),
    '',
  ].join('\n');
}
