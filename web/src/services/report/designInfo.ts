import type { StaticInfo } from '../../engine/openRocketEngine';
import type { ReportModel } from './reportModel';
import type { DesignInfo, DesignFinSet, DesignStat, DesignStatGroup } from '../files/orkTypes';
import i18n from '../../i18n';
import { partLabel } from '../../i18n/format';
import { plainSig } from '../files/numberText';

/** Must match the store's single-point drag sweep that fills StaticInfo.cd. */
const CD_MACH = 0.3;

const M = 'm';
const KG = 'kg';
const INERTIA = 'kg*m^2';
const CAL = 'cal';
const PCT = '%';
const PER_RAD = '1/rad';
const NONE = '';

export const sig4 = (v: number): string => plainSig(v, 4, '0');

export type StatKey =
  | 'length'
  | 'maxDiameter'
  | 'massEmpty'
  | 'massLoaded'
  | 'fineness'
  | 'cgEmpty'
  | 'cgLoaded'
  | 'cp'
  | 'stabilityCal'
  | 'stabilityPct'
  | 'cd'
  | 'cna'
  | 'pitchInertia'
  | 'rollInertia';

/** `field` is the untranslated .ork and CSV label; `value` is SI. */
export interface StatRow {
  key: StatKey;
  field: string;
  value: number;
}

/** A finless design has no CP, so OpenRocket omits CP, both stability rows and CNα. */
export function staticInfoRows(info: StaticInfo): StatRow[] {
  const rows: StatRow[] = [];
  const add = (key: StatKey, field: string, value: number) => rows.push({ key, field, value });
  add('length', 'Length', info.length);
  add('maxDiameter', 'Max Diameter', info.refDiameter);
  add('massEmpty', 'Mass (Empty)', info.massEmpty);
  add('massLoaded', 'Mass (Loaded)', info.mass);
  if (info.refDiameter > 0) add('fineness', 'Fineness (L/D)', info.length / info.refDiameter);
  add('cgEmpty', 'CG (Empty)', info.cgEmpty);
  add('cgLoaded', 'CG (Loaded)', info.cg);
  const hasAero = Number.isFinite(info.cna) && Math.abs(info.cna) > 1e-9;
  if (hasAero && Number.isFinite(info.cp) && info.cp > 0) {
    add('cp', 'CP', info.cp);
    add('stabilityCal', 'Stability (on pad)', info.stabilityCalibers);
    // The engine's figure: the margin is over the aerodynamic length, not `length`.
    add('stabilityPct', 'Stability (%)', info.stabilityPercent);
  }
  if (info.cd != null) add('cd', `Drag Coeff. (Ma ${CD_MACH})`, info.cd);
  if (hasAero) add('cna', 'Normal-Force Slope (CNα)', info.cna);
  add('pitchInertia', 'Pitch Inertia (Loaded)', info.pitchInertia);
  add('rollInertia', 'Roll Inertia (Loaded)', info.rollInertia);
  return rows;
}

const UNIT: Record<StatKey, string> = {
  length: M,
  maxDiameter: M,
  massEmpty: KG,
  massLoaded: KG,
  fineness: NONE,
  cgEmpty: M,
  cgLoaded: M,
  cp: M,
  stabilityCal: CAL,
  stabilityPct: PCT,
  cd: NONE,
  cna: PER_RAD,
  pitchInertia: INERTIA,
  rollInertia: INERTIA,
};

function statsFor(info: StaticInfo): DesignStat[] {
  return staticInfoRows(info)
    .filter((r) => Number.isFinite(r.value))
    .map((r) => ({ field: r.field, value: sig4(r.value), unit: UNIT[r.key] }));
}

export function buildDesignInfo(report: ReportModel): DesignInfo {
  const groups: DesignStatGroup[] = [];

  groups.push({ scope: 'rocket', stats: statsFor(report.whole.info) });

  if (report.stageSummaries.length > 1) {
    report.stageSummaries.forEach((s, i) => {
      groups.push({ scope: 'stage', stageNumber: i, name: s.label, stats: statsFor(s.info) });
    });
  }

  const finsets: DesignFinSet[] = [];
  report.finSetsByStage.forEach((grp, stageNumber) => {
    const counts = new Map<string, number>();
    const labelOf = (set: (typeof grp.sets)[number]) => partLabel(i18n.t, set);
    for (const set of grp.sets) counts.set(labelOf(set), (counts.get(labelOf(set)) ?? 0) + 1);
    const seen = new Map<string, number>();
    for (const set of grp.sets) {
      const label = labelOf(set);
      let name = label;
      if ((counts.get(label) ?? 0) > 1) {
        const n = (seen.get(label) ?? 0) + 1;
        seen.set(label, n);
        name = `${label} #${n}`;
      }
      finsets.push({ stageNumber, stage: grp.stage, name, topX: set.topX, bottomX: set.bottomX });
    }
  });

  return { groups, finsets };
}
