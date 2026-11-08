/** `Motor.MARGINAL_THRUST` (core/.../motor/Motor.java:67). */
const MARGINAL_THRUST = 0.05;

const SAME_MASS = 0.01;

/** `MathUtil.equals` (core/.../util/MathUtil.java), as `mathEquals.ts` ports it. */
function equals(a, b) {
  const eps = 0.00000001;
  const absb = Math.abs(b);
  if (absb < eps / 2) return Math.abs(a) < eps / 2;
  return Math.abs(a - b) < eps * absb;
}

const map = (value, fromMin, fromMax, toMin, toMax) =>
  toMin + ((value - fromMin) * (toMax - toMin)) / (fromMax - fromMin);

/** Mirrors `finalizeCurve` (src/services/motors/curveFinalize.ts); keep the steps in sync. */
function finalizeSamples(samples) {
  const pts = samples.map(([t, f], i) => ({ t, f, i })).sort((a, b) => a.t - b.t || a.i - b.i);
  if (!pts.length) return [];
  if (!equals(pts[0].t, 0)) pts.unshift({ t: 0, f: 0 });
  if (pts.length > 1 && equals(pts[0].t, 0) && equals(pts[1].t, 0)) pts.shift();
  for (let i = 0; i < pts.length - 1; i++) {
    while (i < pts.length - 1 && equals(pts[i].t, pts[i + 1].t) && equals(pts[i].f, pts[i + 1].f)) pts.splice(i, 1);
  }
  const n = pts.length - 1;
  if (n > 0 && equals(pts[n - 1].t, pts[n].t)) {
    const drop = equals(pts[n - 1].f, 0) ? n - 1 : equals(pts[n].f, 0) ? n : -1;
    if (drop >= 0) pts.splice(drop, 1);
  }
  return pts.filter((p, i) => i === pts.length - 1 || !equals(p.t, pts[i + 1].t)).map((p) => [p.t, p.f]);
}

/** `ThrustCurveMotor.computeStatistics` (core/.../motor/ThrustCurveMotor.java:707-795). */
function curveStatistics(curve) {
  if (curve.length < 2) return null;
  const time = curve.map((p) => p[0]);
  const thrust = curve.map((p) => p[1]);
  let maxThrust = 0;
  for (const f of thrust) if (f > maxThrust) maxThrust = f;
  const limit = maxThrust * MARGINAL_THRUST;
  let burnStart;
  if (thrust[0] >= limit) burnStart = time[0];
  else {
    let s = 1;
    while (s < thrust.length && thrust[s] < limit) s++;
    if (s >= thrust.length) return null;
    burnStart = equals(thrust[s - 1], thrust[s])
      ? (time[s - 1] + time[s]) / 2
      : map(limit, thrust[s - 1], thrust[s], time[s - 1], time[s]);
  }
  let burnEnd;
  const last = thrust.length - 1;
  if (thrust[last] >= limit) burnEnd = time[last];
  else {
    let e = last - 1;
    while (e >= 0 && thrust[e] < limit) e--;
    if (e < 0) return null;
    burnEnd = equals(thrust[e], thrust[e + 1])
      ? (time[e] + time[e + 1]) / 2
      : map(limit, thrust[e], thrust[e + 1], time[e], time[e + 1]);
  }
  let impulse = 0;
  for (let i = 0; i < time.length - 1; i++) impulse += ((time[i + 1] - time[i]) * (thrust[i] + thrust[i + 1])) / 2;
  return { impulse, burn: Math.max(burnEnd - burnStart, 0), maxThrust };
}

/** Launch mass in kg (the row's mass is grams). */
export function flownMotor(row) {
  const samples = row.curves?.[0]?.samples;
  const stats = samples?.length ? curveStatistics(finalizeSamples(samples)) : null;
  return {
    launchMass: Number.isFinite(row.mass) && row.mass > 0 ? row.mass / 1000 : undefined,
    impulse: stats?.impulse,
    burn: stats?.burn,
    maxThrust: stats?.maxThrust,
  };
}

const relative = (ours, theirs) =>
  Number.isFinite(ours) && Number.isFinite(theirs) && ours !== 0 ? Math.abs(theirs - ours) / Math.abs(ours) : 0;

function entryDistance(entry, flown) {
  const mass = relative(flown.launchMass, entry.launchMass);
  return [
    mass <= SAME_MASS ? 0 : mass,
    relative(flown.impulse, entry.impulse) +
      relative(flown.burn, entry.burn) +
      relative(flown.maxThrust, entry.maxThrust),
  ];
}

const compareDistance = (a, b) => a[0] - b[0] || a[1] - b[1];

/** Ties break on digest so reruns write the same bytes. */
export function rankEntries(entries, row) {
  const flown = flownMotor(row);
  const byDigest = new Map();
  for (const e of entries) {
    const seen = byDigest.get(e.digest) ?? { delays: new Set(), distance: [Infinity, Infinity] };
    for (const d of e.delays) seen.delays.add(d);
    const dist = entryDistance(e, flown);
    if (compareDistance(dist, seen.distance) < 0) seen.distance = dist;
    byDigest.set(e.digest, seen);
  }
  return [...byDigest]
    .sort(([da, a], [db, b]) => compareDistance(a.distance, b.distance) || (da < db ? -1 : 1))
    .map(([digest, { delays }]) => ({
      digest,
      delays: [...delays].sort((a, b) => (a === 'P' ? 1 : b === 'P' ? -1 : a - b)),
    }));
}
