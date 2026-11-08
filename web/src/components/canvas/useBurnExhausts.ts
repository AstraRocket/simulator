import { useEffect, useMemo, useState } from 'react';
import type { RocketTree } from '../../engine/openRocketEngine';
import type { FlightConfig } from '../../services/flight/flightConfigs';
import { loadCatalog, type CatalogMotor } from '../../services/motors/motorDb';
import { burnExhausts, type Exhaust } from '../../services/motors/exhaust';
import { findSeated } from '../../services/motors/seatedMotor';

export function useBurnExhausts(tree: RocketTree, config: FlightConfig, enabled: boolean): Exhaust[] | undefined {
  const [catalog, setCatalog] = useState<CatalogMotor[] | null>(null);
  useEffect(() => {
    if (!enabled || catalog) return;
    let live = true;
    loadCatalog().then(
      (c) => {
        if (live) setCatalog(c);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [enabled, catalog]);
  return useMemo(
    () => (catalog ? burnExhausts(tree, config, catalog, findSeated) : undefined),
    [tree, config, catalog],
  );
}
