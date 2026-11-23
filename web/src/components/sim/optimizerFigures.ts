import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import type { RocketTree } from '../../engine/openRocketEngine';
import { walkNodes } from '../../tree/treeWalk';
import { partName } from '../config/partName';
import type { Units } from '../../prefs/useUnits';
import type { Quantity } from '../../prefs/units';
import type { OptKey, OptKind, OptParam } from '../../services/flight/optimizer/optParams';
import type { StabilityUnit } from '../../services/flight/optimizer/optGoals';
import { fmtNum } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';

export const PARAM_LABEL: Record<OptKey, string> = {
  length: 'optimize.param.length',
  baseDiameter: 'optimize.param.baseDiameter',
  foreDiameter: 'optimize.param.foreDiameter',
  aftDiameter: 'optimize.param.aftDiameter',
  outerDiameter: 'optimize.param.outerDiameter',
  shapeParameter: 'optimize.param.shapeParameter',
  rootChord: 'optimize.param.rootChord',
  tipChord: 'optimize.param.tipChord',
  sweep: 'optimize.param.sweep',
  height: 'optimize.param.height',
  position: 'optimize.param.position',
  mass: 'optimize.param.mass',
  motorOverhang: 'optimize.param.motorOverhang',
  ignitionDelay: 'optimize.param.ignitionDelay',
  chuteDiameter: 'optimize.param.chuteDiameter',
  stripLength: 'optimize.param.stripLength',
  stripWidth: 'optimize.param.stripWidth',
  deployDelay: 'optimize.param.deployDelay',
  deployAltitude: 'optimize.param.deployAltitude',
};

const KIND_QUANTITY: Partial<Record<OptKind, Quantity>> = { length: 'length', distance: 'distance', mass: 'mass' };

/** Seconds, calibers and shape parameters convert to nothing. */
export interface FigureUnit {
  sym: string;
  toUi: (si: number) => number;
  toSi: (ui: number) => number;
  fmt: (si: number) => string;
}

export function unitOf(u: Units, q: Quantity | undefined, sym: string, digits = 2): FigureUnit {
  if (!q) return { sym, toUi: (v) => v, toSi: (v) => v, fmt: (v) => fmtNum(v, digits) };
  const f = u.plain(q);
  return { sym: f.sym, toUi: f.toUi, toSi: f.fromUi, fmt: (si) => f.fmt(si) };
}

export function paramUnit(u: Units, p: Pick<OptParam, 'kind'>, t: TFunction): FigureUnit {
  if (p.kind === 'time') return unitOf(u, undefined, t('units.second'), 2);
  if (p.kind === 'number') return unitOf(u, undefined, '', 3);
  return unitOf(u, KIND_QUANTITY[p.kind], '');
}

export function stabilityFigureUnit(u: Units, unit: StabilityUnit, t: TFunction): FigureUnit {
  return unit === 'length' ? unitOf(u, 'length', '') : unitOf(u, undefined, t('stability.caliber'), 2);
}

export const show = (c: FigureUnit, si: number): string => (Number.isFinite(si) ? c.fmt(si) : NO_VALUE);

export const numCls =
  'w-20 rounded bg-raised px-1 py-0.5 text-right text-[11px] tabular-nums text-ink-strong ring-1 ring-line/10';

/** Each part's own name, else its type numbered among its kind, as the flight configurations name parts. */
export function useNodeNames(tree: RocketTree, t: TFunction): Map<string, string> {
  return useMemo(() => {
    const seen = new Map<string, number>();
    const out = new Map<string, string>();
    for (const n of walkNodes(tree.components)) {
      const i = seen.get(n.type) ?? 0;
      seen.set(n.type, i + 1);
      if (typeof n.id === 'string') out.set(n.id, partName(n, i, t));
    }
    return out;
  }, [tree, t]);
}

/** "Nose cone 1 · Length". */
export const paramName = (p: OptParam, nodeNames: Map<string, string>, t: TFunction): string =>
  `${nodeNames.get(p.nodeId) ?? p.nodeId} · ${t(PARAM_LABEL[p.key])}`;
