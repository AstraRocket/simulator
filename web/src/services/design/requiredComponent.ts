import type { RocketTree } from '../../engine/openRocketEngine';
import { walkNodes } from '../../tree/treeWalk';
import { finCant, str } from '../../tree/nodeProps';
import { finMountOf, finRootChord } from '../../tree/finPlanform';
import { isPlanarFinSet } from '../../tree/tubefins';

/** Only these stop a kernel run (bridge refusal or NaN mass); other zeros fly, as on desktop. */
export const REQUIRED_COMPONENT_FIELDS: Record<string, readonly string[]> = {
  trapezoidfinset: ['finCount'],
  ellipticalfinset: ['finCount'],
  freeformfinset: ['finCount'],
  tubefinset: ['finCount', 'length'],
  centeringring: ['instanceCount'],
  bulkhead: ['instanceCount'],
  launchlug: ['instanceCount'],
  railbutton: ['outerDiameter', 'height', 'instanceCount'],
  podset: ['instanceCount'],
  parallelstage: ['instanceCount'],
};

export interface NamedPart {
  id?: string;
  type: string;
  name: string;
}

export interface BadDimension extends NamedPart {
  field: string;
}

export const isDimension = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

export function badDimensions(tree: RocketTree): BadDimension[] {
  const out: BadDimension[] = [];
  for (const n of walkNodes(tree.components ?? [])) {
    for (const field of REQUIRED_COMPONENT_FIELDS[n.type] ?? []) {
      if (n[field] != null && !isDimension(n[field])) {
        out.push({ id: n.id, type: n.type, name: str(n, 'name'), field });
      }
    }
  }
  return out;
}

const CANT_STEPS = 100;

/** FinSet.getFinCantYOffset (FinSet.java:1264-1302) guards only `dz >= r`, so a forward station with `|dz| >= r` flies NaN. */
export function overturnedFins(tree: RocketTree): NamedPart[] {
  const out: NamedPart[] = [];
  for (const n of walkNodes(tree.components ?? [])) {
    if (!isPlanarFinSet(n.type) || !n.id) continue;
    const cant = finCant(n);
    if (cant === 0) continue;
    const mount = finMountOf(tree, n.id);
    if (!mount) continue;
    const xStart = mount.front;
    const xEnd = xStart + finRootChord(n);
    if ((xStart > mount.length && xEnd > mount.length) || (xStart < 0 && xEnd < 0)) continue;
    const xCenter = (xStart + xEnd) / 2;
    const sin = Math.abs(Math.sin(cant));
    const cos = Math.abs(Math.cos(cant));
    for (let i = 0; i < CANT_STEPS; i++) {
      const x = Math.min(Math.max(xStart + ((xCenter - xStart) * i) / CANT_STEPS, 0), mount.length);
      const dx = x - xCenter;
      if (dx >= 0) break;
      if (sin * -dx >= mount.radiusAt(xCenter + dx * cos)) {
        out.push({ id: n.id, type: n.type, name: str(n, 'name') });
        break;
      }
    }
  }
  return out;
}
