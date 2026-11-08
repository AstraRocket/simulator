import type { CatalogMotor } from './motorDb';
import type { MotorSpec } from '../../engine/openRocketEngine';
import { roundTo } from '../app/numbers';
import { toCatalogMm } from './catalogUnits';

/** A designation is shared (F67W, F67C), so same-name matches narrow by bore and curve source. */
export function findSeated(catalog: CatalogMotor[], cur: MotorSpec): CatalogMotor | undefined {
  const named = catalog.filter(
    (m) => m.manufacturer === cur.manufacturer && (m.designation === cur.designation || m.code === cur.designation),
  );
  if (named.length <= 1) return named[0];
  // The catalog states diameters to 0.1 mm (the 10.5 mm Apogee motors).
  const mm = roundTo(toCatalogMm(cur.diameter), 1);
  const byBore = named.filter((m) => m.diameter === mm);
  const pool = byBore.length ? byBore : named;
  return (cur.curveSrc && pool.find((m) => m.curves?.some((c) => c.src === cur.curveSrc))) || pool[0];
}
