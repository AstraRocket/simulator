import { useMemo, useState } from 'react';
import { hasLocalCurve, type CatalogMotor } from '../../services/motors/motorDb';
import { keyOf } from '../../services/motors/motorKey';
import { avgThrustOf } from '../../services/motors/motorMath';
import { compareSortKeys } from '../../services/app/sortKeys';
import type { GuideRowBase, GuideCol } from './GuideResults';

export const motorCols = <R extends GuideRowBase>(): GuideCol<R>[] => [
  { id: 'impulse', label: 'motorDlg.totalImpulse', quantity: 'impulse', value: (r) => r.motor.impulse },
  { id: 'avgThrust', label: 'motorDlg.avgThrust', quantity: 'force', value: (r) => avgThrustOf(r.motor) },
];

/** Unknown figures sort last in either direction. */
export function sortGuideRows<R>(rows: readonly R[], val: (r: R) => number | string, desc: boolean): R[] {
  return [...rows].sort((a, b) => compareSortKeys(val(a), val(b), desc ? -1 : 1));
}

/** Kept as exclusions, so a motor a filter change brings in arrives ticked. */
export function useGuideCandidates(matches: CatalogMotor[]) {
  const candidates = useMemo(() => matches.filter(hasLocalCurve), [matches]);
  const noCurve = useMemo(() => matches.filter((m) => !hasLocalCurve(m)), [matches]);
  const [dropped, setDropped] = useState<ReadonlySet<string>>(() => new Set());
  const flying = useMemo(() => candidates.filter((m) => !dropped.has(keyOf(m))), [candidates, dropped]);
  return { candidates, noCurve, dropped, setDropped, flying };
}
