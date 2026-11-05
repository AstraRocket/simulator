// The first curve sets the loaded mass, so the order must not depend on the API's.

const SRC_RANK = { cert: 0, mfr: 1, user: 2 };

export function rankCurves(files) {
  return [...files].sort(
    (a, b) =>
      (SRC_RANK[a.source] ?? 9) - (SRC_RANK[b.source] ?? 9) ||
      (a.format === 'RASP' ? 0 : 1) - (b.format === 'RASP' ? 0 : 1) ||
      b.samples.length - a.samples.length ||
      String(a.simfileId ?? '').localeCompare(String(b.simfileId ?? ''), 'en'),
  );
}
