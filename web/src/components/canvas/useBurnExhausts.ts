import { useMemo } from 'react';
import type { RocketTree } from '../../engine/openRocketEngine';
import type { FlightConfig } from '../../services/flight/flightConfigs';
import { loadCatalog } from '../../services/motors/motorDb';
import { burnExhausts, type Exhaust } from '../../services/motors/exhaust';
import { findSeated } from '../../services/motors/seatedMotor';
import { useAsyncLoad } from '../common/useAsyncLoad';

export function useBurnExhausts(tree: RocketTree, config: FlightConfig, enabled: boolean): Exhaust[] | undefined {
  const { data: catalog } = useAsyncLoad(loadCatalog, 'catalog', { enabled });
  return useMemo(
    () => (catalog ? burnExhausts(tree, config, catalog, findSeated) : undefined),
    [tree, config, catalog],
  );
}
