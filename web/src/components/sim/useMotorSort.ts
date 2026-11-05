import { useMemo } from 'react';
import type { CatalogMotor } from '../../services/motors/motorDb';
import { COLUMNS } from './motorColumns';
import { compareSortKeys } from '../../services/app/sortKeys';
import { useRemembered, useSlot, type RememberedSlot } from '../tools/remembered';

export interface MotorSort {
  id: string;
  dir: 1 | -1;
}

export interface MotorSortHeld {
  sort: MotorSort | null;
}

export function useMotorSort(filtered: CatalogMotor[], slot?: RememberedSlot<MotorSortHeld>) {
  const [sort, setSort] = useRemembered(useSlot(slot), 'sort', null);

  const shown = useMemo(() => {
    const col = sort && COLUMNS.find((c) => c.id === sort.id);
    if (!col?.sortVal) return filtered;
    const val = col.sortVal;
    return [...filtered].sort((a, b) => compareSortKeys(val(a), val(b), sort!.dir));
  }, [filtered, sort]);

  const clickHeader = (id: string) =>
    setSort((s) => (s && s.id === id ? { id, dir: (s.dir * -1) as 1 | -1 } : { id, dir: 1 }));

  return { sort, shown, clickHeader };
}
