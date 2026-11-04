import type { CSSProperties } from 'react';
import type { AeroSweep, ComponentMass } from '../../engine/openRocketEngine';
import { polylinePath } from '../common/svgPath';
import { niceStep } from '../../prefs/units';
import { componentName, isDefaultComponentName } from '../../services/app/warningText';
import { roundFixed } from '../../services/app/numbers';

export type HeatStyle = 'sky' | 'openrocket';

// Matches java.awt.Color.getHSBColor.
export function hsv(h: number, sat: number, val: number): string {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return Math.round(255 * (val - val * sat * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return `rgb(${f(5)}, ${f(3)}, ${f(1)})`;
}

// `openrocket` is the desktop's formula over absolute Cd (full red at 1.5).
export function heat(value: number, max: number, style: HeatStyle): CSSProperties | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;

  if (style === 'openrocket') {
    const r = value / 1.5;
    const hue = Math.max(0, Math.min(0.3333 * (1 - 2 * r), 0.3333));
    const sat = Math.max(0, Math.min(0.8 * r + 0.1 * (1 - r), 1));
    return { backgroundColor: hsv(hue, sat, 1), color: '#000' };
  }

  if (!(max > 0)) return undefined;
  const a = Math.min(1, value / max) * 0.55;
  return { backgroundColor: `rgba(2, 132, 199, ${a.toFixed(3)})` };
}

type Translate = (key: string) => string;

// An unnamed part arrives as the kernel's bundle key ("[BodyTube.BodyTube]").
export function niceName(raw: string, translate?: Translate): string {
  if (translate && isDefaultComponentName(raw)) return componentName(raw, translate);
  // Typed names keep their dots and capitals ("Fins 4.5in"); only a bracketed key is rewritten.
  if (!/^\[[^\]]*\]$/.test(raw)) return raw;
  const m = raw.match(/^\[?([^.\]]+)\.([^.\]]+)\]?$/);
  const cls = m?.[1] ?? raw.replace(/[[\]]/g, '');
  const inst = m?.[2];
  const base = inst && inst !== cls ? inst : cls;
  return base.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

// `factor` is meters to the user's unit; toSi rounds too, so the screen shows the flown altitude.
export function altitudeField(factor: number): {
  toUi: (m: number) => number;
  toSi: (ui: number) => number;
  max: number;
  step: number;
} {
  const digits = factor < 0.01 ? 2 : 0;
  const round = (v: number) => roundFixed(v, digits);
  return {
    toUi: (m) => round(m * factor),
    toSi: (ui) => round(ui) / factor,
    max: round(30_000 * factor),
    // Never zero: Math.round(500 m in miles) is 0.
    step: digits ? niceStep(500 * factor) : Math.round(500 * factor),
  };
}

export function unitDigits(factor: number, siStep: number): number {
  const step = Math.abs(factor * siStep);
  if (!(step > 0) || !Number.isFinite(step)) return 1;
  return Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
}

export function buildLinePath(
  machs: readonly number[],
  vals: readonly number[],
  X: (m: number) => number,
  Y: (v: number) => number,
): string {
  return polylinePath(
    machs.map((m, i) => {
      const v = vals[i] ?? NaN;
      return Number.isFinite(m) && Number.isFinite(v) ? [X(m), Y(v)] : [NaN, NaN];
    }),
    'comma',
  );
}

// A real sample, not interpolated, so tables match the CSV.
export function nearestSampleIndex(machs: readonly number[], mach: number): number {
  let best = 0;
  for (let k = 1; k < machs.length; k++) {
    if (Math.abs(machs[k]! - mach) < Math.abs(machs[best]! - mach)) best = k;
  }
  return best;
}

type SweepComponent = AeroSweep['components'][number];

// Two parts can share a name, so the label cannot be the row key.
const rowKey = (c: SweepComponent): string => c.key ?? c.name;

export interface DragRow {
  key: string;
  name: string;
  instances: number;
  cdInstance: number | null | undefined;
  cd: number;
  friction: number | null | undefined;
  pressure: number | null | undefined;
  base: number | null | undefined;
}

export function dragRows(sweep: AeroSweep, i: number, translate?: Translate): DragRow[] {
  return sweep.components
    .map((c) => ({
      key: rowKey(c),
      name: niceName(c.name, translate),
      instances: c.instances ?? 1,
      cdInstance: c.cdInstance?.[i],
      cd: c.cd[i] ?? 0,
      friction: c.friction?.[i],
      pressure: c.pressure?.[i],
      base: c.base?.[i],
    }))
    .sort((a, b) => b.cd - a.cd);
}

export function dragTotals(
  sweep: AeroSweep,
  i: number,
): { totalCd: number; attributed: number; unattributed: number; hasSplit: boolean; hasInstances: boolean } {
  const totalCd = sweep.powerOff.total[i] ?? 0;
  const attributed = sweep.components.reduce((a, c) => a + (c.cd[i] ?? 0), 0);
  return {
    totalCd,
    attributed,
    unattributed: totalCd - attributed,
    hasSplit: sweep.components.some((c) => c.friction || c.pressure || c.base),
    hasInstances: sweep.components.some((c) => (c.instances ?? 1) > 1),
  };
}

// Keyed on the stable id: same-named parts would swap masses on a name join.
export const massIndex = (masses: readonly ComponentMass[]): Map<string, ComponentMass> =>
  new Map(masses.map((m) => [m.key || m.name, m]));

export interface StabilityRow {
  key: string;
  name: string;
  cna: number;
  cp: number;
  mass: ComponentMass | undefined;
}

export function stabilityRows(
  sweep: AeroSweep,
  i: number,
  massOf: Map<string, ComponentMass>,
  translate?: Translate,
): StabilityRow[] {
  return sweep.components
    .map((c) => ({
      key: rowKey(c),
      name: niceName(c.name, translate),
      cna: c.cna?.[i] ?? 0,
      cp: c.cp?.[i] ?? 0,
      mass: massOf.get(rowKey(c)),
    }))
    .filter((r) => Math.abs(r.cna) > 1e-9)
    .sort((a, b) => b.cna - a.cna);
}

export interface RollRow {
  key: string;
  name: string;
  type: string;
  force: number;
  damp: number;
}

// Fin sets match by class name: at rest their numbers equal a body tube's.
export function rollRows(sweep: AeroSweep, i: number, translate?: Translate): RollRow[] {
  return sweep.components
    .map((c) => ({
      key: rowKey(c),
      name: niceName(c.name, translate),
      type: c.type ?? '',
      force: c.rollForce?.[i] ?? 0,
      damp: c.rollDamp?.[i] ?? 0,
    }))
    .filter((r) => /FinSet/i.test(r.type) || Math.abs(r.force) > 1e-12 || Math.abs(r.damp) > 1e-12);
}

export function columnMax(rows: readonly number[]): number {
  let m = 0;
  for (const v of rows) if (Math.abs(v) > m) m = Math.abs(v);
  return m;
}

export interface ChartSeries {
  name: string;
  color: string;
  values: number[];
}

export function chartDomain(
  series: readonly ChartSeries[],
  machs: readonly number[],
  stacked: boolean,
): { yMin: number; yMax: number } {
  let yMin = 0;
  let yMax = 0;
  if (stacked) {
    for (let i = 0; i < machs.length; i++) {
      let s = 0;
      for (const se of series) s += Math.max(0, se.values[i] ?? 0);
      if (s > yMax) yMax = s;
    }
  } else {
    yMin = Infinity;
    yMax = -Infinity;
    for (const se of series)
      for (const v of se.values)
        if (Number.isFinite(v)) {
          if (v > yMax) yMax = v;
          if (v < yMin) yMin = v;
        }
    if (!Number.isFinite(yMax)) {
      yMax = 1;
      yMin = 0;
    }
    yMin = Math.min(0, yMin);
  }
  if (yMax === yMin) yMax = yMin + 1;
  yMax += (yMax - yMin) * 0.08;
  return { yMin, yMax };
}

// A non-finite sample adds zero to the sum: a NaN there makes the browser drop every band above.
export function stackedBands(
  series: readonly ChartSeries[],
  machs: readonly number[],
  X: (m: number) => number,
  Y: (v: number) => number,
): { fill: string; d: string }[] {
  const bands: { fill: string; d: string }[] = [];
  const cum = new Array<number>(machs.length).fill(0);
  for (const se of series) {
    const lower = cum.slice();
    for (let i = 0; i < machs.length; i++) {
      const v = se.values[i];
      cum[i] = (cum[i] ?? 0) + (Number.isFinite(v) ? Math.max(0, v!) : 0);
    }
    const parts: string[] = [];
    let run: number[] = [];
    const flush = () => {
      if (run.length < 2) {
        run = [];
        return;
      }
      const top = run.map((i) => `${X(machs[i]!).toFixed(1)},${Y(cum[i]!).toFixed(1)}`).join(' L');
      const bot = run
        .map((i) => `${X(machs[i]!).toFixed(1)},${Y(lower[i]!).toFixed(1)}`)
        .reverse()
        .join(' L');
      parts.push(`M${top} L${bot} Z`);
      run = [];
    };
    for (let i = 0; i < machs.length; i++) {
      const drawable =
        Number.isFinite(machs[i]) &&
        Number.isFinite(se.values[i]) &&
        Number.isFinite(cum[i]) &&
        Number.isFinite(lower[i]);
      if (drawable) run.push(i);
      else flush();
    }
    flush();
    bands.push({ fill: se.color, d: parts.join(' ') });
  }
  return bands;
}

export function machTicks(machMin: number, machMax: number): number[] {
  const step = machMax <= 1 ? 0.2 : 1;
  const ticks = [machMin];
  for (let m = step; m <= machMax + 1e-9; m += step) ticks.push(roundFixed(m, 2));
  return ticks;
}

// `aero` matches desktop's `PercentageOfLengthUnit` (`getLengthAerodynamic`).
export type CpMode = 'len' | 'body' | 'aero';

export function cpModesFor(bodyLen: number, aeroLen: number): CpMode[] {
  const modes: CpMode[] = ['len'];
  if (bodyLen > 0) modes.push('body');
  if (aeroLen > 0) modes.push('aero');
  return modes;
}

// 0 means length units.
export function cpDivisor(mode: CpMode, bodyLen: number, aeroLen: number): number {
  const d = mode === 'body' ? bodyLen : mode === 'aero' ? aeroLen : 0;
  return d > 0 ? d : 0;
}
