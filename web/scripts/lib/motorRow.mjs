import { rankCurves } from './rankCurves.mjs';

const round = (n, d) => (Number.isFinite(n) ? Number(n.toFixed(d)) : 0);

/** Apogee's 10.5 mm motors must not round to 11 (lib/motorDigestKey.mjs keys the same). */
export const DIAMETER_DECIMALS = 1;

const sourceLabel = (s) => ({ cert: 'Certified', mfr: 'Manufacturer', user: 'User' })[s] || s || 'Unknown';

/** Loaded mass (g) from the curve file (RASP kg, RockSim g), as OpenRocket uses it over thrustcurve.org metadata. */
function fileLoadedMassG(format, b64) {
  if (!b64) return null;
  const text = Buffer.from(b64, 'base64').toString('utf8');
  if (format === 'RASP') {
    // name  diameter  length  delays  propWeight(kg)  totalWeight(kg)  manufacturer
    const header = text.split('\n').find((l) => l.trim() && !l.trim().startsWith(';'));
    const total = header ? parseFloat(header.trim().split(/\s+/)[5]) : NaN;
    return Number.isFinite(total) ? total * 1000 : null;
  }
  if (format === 'RockSim') {
    const m = text.match(/<engine\b[^>]*\binitWt="([\d.]+)"/i);
    return m ? parseFloat(m[1]) : null;
  }
  return null;
}

/** [[t(s), cg(m)]]; the file's cg is mm from the motor's forward end. */
function rockSimCg(b64) {
  if (!b64) return null;
  const text = Buffer.from(b64, 'base64').toString('utf8');
  const pts = [];
  for (const m of text.matchAll(/<eng-data\b([^>]*)\/>/g)) {
    const cg = m[1].match(/\bcg="([\d.]+)"/);
    const t = m[1].match(/\bt="([\d.]+)"/);
    if (cg && t) pts.push([round(parseFloat(t[1]), 4), round(parseFloat(cg[1]) / 1000, 5)]);
  }
  return pts.length ? pts : null;
}

export function motorRow(m, curve) {
  const row = {
    designation: m.commonName || m.designation,
    manufacturer: m.manufacturerAbbrev || m.manufacturer,
    class: m.impulseClass,
    diameter: round(m.diameter, DIAMETER_DECIMALS),
    impulse: round(m.totImpulseNs, 3),
    burn: round(m.burnTimeS, 3),
    mass: round(m.totalWeightG, 2),
  };
  if (m.designation && m.designation !== row.designation) row.code = m.designation;
  if (m.type) row.type = m.type;
  if (m.delays) row.delays = m.delays;
  if (m.propInfo) row.propInfo = m.propInfo;
  if (m.sparky) row.sparky = true;
  if (m.availability === 'OOP') row.oop = true;
  if (Number.isFinite(m.avgThrustN)) row.avgThrust = round(m.avgThrustN, 2);
  if (Number.isFinite(m.maxThrustN)) row.maxThrust = round(m.maxThrustN, 2);
  if (Number.isFinite(m.length)) row.length = round(m.length, 2); // mm
  if (Number.isFinite(m.propWeightG)) row.propWeightG = round(m.propWeightG, 2);
  if (curve && Number.isFinite(m.length) && Number.isFinite(m.propWeightG)) {
    const ranked = rankCurves(curve);
    row.curves = ranked.map((c) => ({
      src: `${sourceLabel(c.source)} · ${c.format}`,
      samples: c.samples.map((s) => [round(s.time, 4), round(s.thrust, 3)]),
    }));
    const fileMass = fileLoadedMassG(ranked[0].format, ranked[0].data);
    if (Number.isFinite(fileMass)) row.mass = round(fileMass, 2);
    const rockSim = ranked.find((c) => c.format === 'RockSim');
    const cg = rockSim ? rockSimCg(rockSim.data) : null;
    if (cg) row.cg = cg;
  } else {
    row.noCurve = true;
  }
  return row;
}
