import type { MotorSpec, MotorType } from '../../../engine/openRocketEngine';
import { motorDigest } from '../../motors/motorDigest';
import { finalizeThrustCurve, sortLists } from '../../motors/curveFinalize';
import { escapeXml } from '../xmlUtil';

/** Desktop accepts it only if the parsed curve hashes to the name (`MotorHandler.loadMotorFromZip`). */
export interface EmbeddedMotorFile {
  digest: string;
  path: string;
  text: string;
}

/** One `<eng-data>` row: s, N, kg, m. */
interface Row {
  t: number;
  f: number;
  m: number;
  cg: number;
}

export function rowsDigest(rows: readonly Row[]): string {
  const times = rows.map((r) => r.t);
  const thrusts = rows.map((r) => r.f);
  const masses = rows.map((r) => r.m);
  const cgs = rows.map((r) => r.cg);
  sortLists(times, thrusts, masses, cgs);
  finalizeThrustCurve(times, thrusts, [masses, cgs]);
  return motorDigest({ times, masses, cgs, thrusts });
}

const attrOf = (attrs: string, key: string): number | null => {
  const m = new RegExp(`(?:^|\\s)${key}="([^"]*)"`).exec(attrs);
  const v = m ? Number(m[1]) : NaN;
  return Number.isFinite(v) ? v : null;
};

/** Null unless every row states mass and CG: desktop hashes other data under auto-calc (`RockSimMotorLoader.getMotor`). */
export function rseDigest(text: string): string | null {
  const rows: Row[] = [];
  for (const [, attrs] of text.matchAll(/<eng-data\s([^>]*?)\/?>/g)) {
    const t = attrOf(attrs!, 't');
    const f = attrOf(attrs!, 'f');
    const m = attrOf(attrs!, 'm');
    const cg = attrOf(attrs!, 'cg');
    if (t === null || f === null || m === null || cg === null) return null;
    rows.push({ t, f, m: m / 1000, cg: cg / 1000 });
  }
  return rows.length ? rowsDigest(rows) : null;
}

/** Shortest round-trip form, which Java's `Double.parseDouble` reads back exactly. */
const num = (v: number) => String(v);

const RSE_TYPES: Record<MotorType, string> = { SU: 'single-use', reload: 'reloadable', hybrid: 'hybrid' };

const typeAttr = (spec: MotorSpec): string => (spec.type ? ` Type="${RSE_TYPES[spec.type]}"` : '');

export function embeddedMotorFile(spec: MotorSpec): EmbeddedMotorFile | null {
  const n = Math.min(spec.times?.length ?? 0, spec.thrusts?.length ?? 0, spec.masses?.length ?? 0);
  if (n < 2) return null;
  const written = Array.from({ length: n }, (_, i) => ({
    t: num(spec.times[i]!),
    f: num(spec.thrusts[i]!),
    m: num(spec.masses[i]! * 1000),
    cg: num(spec.cgX * 1000),
  }));
  // Hashed from the text as the loader reads it back (g and mm / 1000).
  const digest = rowsDigest(
    written.map((r) => ({ t: Number(r.t), f: Number(r.f), m: Number(r.m) / 1000, cg: Number(r.cg) / 1000 })),
  );
  const initWt = spec.masses[0]! * 1000;
  const propWt = (spec.masses[0]! - spec.masses[n - 1]!) * 1000;
  const lines = [
    '<engine-database>',
    ' <engine-list>',
    `  <engine mfg="${escapeXml(spec.manufacturer || 'custom')}" code="${escapeXml(spec.designation)}"${typeAttr(spec)}` +
      ` dia="${num(spec.diameter * 1000)}" len="${num(spec.length * 1000)}" initWt="${num(initWt)}"` +
      ` propWt="${num(propWt)}" auto-calc-mass="0" auto-calc-cg="0">`,
    '   <data>',
    ...written.map((r) => `    <eng-data t="${r.t}" f="${r.f}" m="${r.m}" cg="${r.cg}"/>`),
    '   </data>',
    '  </engine>',
    ' </engine-list>',
    '</engine-database>',
    '',
  ];
  return { digest, path: `thrustcurves/${digest}.rse`, text: lines.join('\n') };
}
