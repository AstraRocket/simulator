import { tubeRadii } from '../design/discGeometry';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { toCatalogMm } from './catalogUnits';

// mm.
export const STD_DIAMS = [6, 13, 18, 24, 29, 38, 54, 75, 98, 150];
export const MAX_IDX = STD_DIAMS.length - 1;

// Small enough not to admit the next standard size.
const FIT_TOLERANCE_MM = 1;

/** `bore` in mm. */
export function fitIdx(bore: number): number {
  let i = 0;
  while (i < MAX_IDX && STD_DIAMS[i + 1]! <= bore + FIT_TOLERANCE_MM) i++;
  return i;
}

/** In millimeters. */
export interface MountFit {
  bore: number;
  /** Includes motor overhang: the app seats a motor at `aft - motorLength + overhang` (rocketPieces.ts). */
  maxLength?: number;
}

/** The bore comes from `tubeRadii`, as the drawings use, so the browser and file reader agree. */
export function mountFit(node: Record<string, unknown>): MountFit | null {
  const finite = (k: string): number | null => (Number.isFinite(node[k]) ? (node[k] as number) : null);
  const tube = tubeRadii(node as ComponentNode);
  if (!tube) return null;
  const tubeLen = finite('length');
  const overhang = finite('motorOverhang') ?? 0;
  return {
    bore: toCatalogMm(tube.innerR * 2),
    ...(tubeLen != null ? { maxLength: toCatalogMm(tubeLen + overhang) } : {}),
  };
}

export function motorFitsMount(m: { diameter: number; length?: number }, fit: MountFit): boolean {
  if (m.diameter > fit.bore + FIT_TOLERANCE_MM) return false;
  if (fit.maxLength != null && m.length != null && m.length > fit.maxLength + FIT_TOLERANCE_MM) return false;
  return true;
}

/** `RASPMotorLoader` drops delays at or over this rather than reading them as plugged. */
const RASP_DROP_AT = 99;

/** `RockSimMotorLoader.DELAY_LIMIT`: at or past this reads as plugged. */
const ROCKSIM_PLUGGED_AT = 90;

/** A big number means plugged in RockSim (1000) but nothing at all in RASP (100). */
export function delayList(raw: string | null | undefined, format: 'rasp' | 'rocksim'): string | undefined {
  if (!raw) return undefined;
  const rasp = format === 'rasp';
  if (rasp && /^none$/i.test(raw.trim())) return undefined;
  const out: number[] = [];
  let plugged = false;
  for (const tok of raw.split(rasp ? /[-,\s]+/ : /[,\s]+/)) {
    const t = tok.trim();
    if (!t) continue;
    if (/^p/i.test(t)) {
      plugged = true;
      continue;
    }
    const v = Number(t);
    if (!Number.isFinite(v)) continue;
    if (rasp) {
      if (/^\d+$/.test(t) && v < RASP_DROP_AT) out.push(v);
    } else if (v >= ROCKSIM_PLUGGED_AT) {
      plugged = true;
    } else {
      out.push(v);
    }
  }
  // RASP's loader sorts; RockSim's keeps file order.
  if (rasp) out.sort((a, b) => a - b);
  const parts = out.map(String);
  if (plugged) parts.push('P');
  return parts.length ? parts.join(',') : undefined;
}

export function parseDelays(s?: string): { delays: number[]; plugged: boolean } {
  if (!s) return { delays: [], plugged: false };
  let plugged = false;
  const delays: number[] = [];
  for (const tok of s.split(/[,\s-]+/)) {
    if (!tok) continue;
    if (/^p/i.test(tok)) {
      plugged = true;
      continue;
    }
    const n = Number(tok);
    if (Number.isFinite(n)) delays.push(n);
  }
  return { delays: [...new Set(delays)].sort((a, b) => a - b), plugged };
}

/** Built plugged, not merely flyable plugged. */
export function offersPlugged(m: { delays?: string }): boolean {
  return parseDelays(m.delays).plugged;
}

/** `win` in seconds. */
export function initialThrust(samples: [number, number][], win = 0.5): number | null {
  if (samples.length < 2) return null;
  let imp = 0,
    dur = 0;
  for (let i = 1; i < samples.length; i++) {
    const [t0, f0] = samples[i - 1]!;
    let [t1, f1] = samples[i]!;
    if (t0 >= win) break;
    if (t1 > win) {
      f1 = f0 + (f1 - f0) * ((win - t0) / (t1 - t0));
      t1 = win;
    }
    imp += ((t1 - t0) * (f0 + f1)) / 2;
    dur += t1 - t0;
  }
  return dur > 0 ? imp / dur : null;
}
