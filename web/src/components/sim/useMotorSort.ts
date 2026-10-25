import { useMemo, useState } from 'react';
import type { CatalogMotor } from '../../services/motors/motorDb';
import { COLUMNS } from './motorColumns';
import { compareSortKeys } from '../../services/app/sortKeys';

/**
 * The motor grid's sort: which column, which direction, the sorted list, and
 * the header click that cycles a column through ascending / descending.
 */

export interface MotorSort {
  id: string;
  dir: 1 | -1;
}

export function useMotorSort(filtered: CatalogMotor[]) {
  const [sort, setSort] = useState<MotorSort | null>(null);

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
