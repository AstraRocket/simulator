import type { ComponentNode } from '../../../engine/openRocketEngine';
import type { Keyed } from '../../../i18n/keyedError';
import type { Cdx1Writer } from './units';
import { bodyTubeRadius, num, str } from '../../../tree/nodeProps';
import { partLength } from '../../../tree/position';
import { nodeOuterProfile, profileEnds } from '../../../tree/shapeProfile';
import { finPlanformArea, finPlanformPoints } from '../../../tree/finPlanform';
import { isPlanarFinSet } from '../../../tree/tubefins';
import { walkNodes } from '../../../tree/treeWalk';

// Maps, not plain objects: free-text keys like `constructor` would hit Object.prototype.
export const SECTION_TO_AIRFOIL: ReadonlyMap<string, string> = new Map(
  Object.entries({
    doublewedge: 'Double Wedge',
    hexbluntbase: 'Hexagonal Blunt Base',
    hexagonal: 'Hexagonal',
    naca: 'NACA',
    biconvex: 'Biconvex',
    singlewedge: 'Single Wedge',
  }),
);

// Must stay in ExternalComponent.Finish order: designSurface's tie-break depends on it.
const FINISH_TO_SURFACE: ReadonlyMap<string, string> = new Map(
  Object.entries({
    rough: 'Cast Iron (Very Rough)',
    roughunfinished: 'Cast Iron (Very Rough)',
    unfinished: 'Galvanized Metal',
    normal: 'Rough Camouflage Paint',
    smooth: 'Camouflage Paint',
    optimum: 'Sheet Metal',
    polished: 'Polished',
    finishpolished: 'Polished',
    mirror: 'Smooth (Zero Roughness)',
  }),
);
export const RASAERO_SURFACE_DEFAULT = 'Smooth (Zero Roughness)';

export const RASAERO_SURFACE_WARNING: Keyed = { key: 'errors.exportRasaeroSurface' };

export function rasaeroSurface(finish: string): { surface: string; warning?: Keyed } {
  const surface = FINISH_TO_SURFACE.get(finish);
  if (surface) return { surface };
  return { surface: RASAERO_SURFACE_DEFAULT, warning: RASAERO_SURFACE_WARNING };
}

const WET_AREA_STEPS = 128;

/** m^2, as `SymmetricComponent.getComponentWetArea` and fins' `2 * getPlanformArea() * getFinCount()`. */
function wetArea(node: ComponentNode): number | null {
  if (node.type === 'bodytube') return 2 * Math.PI * bodyTubeRadius(node) * partLength(node);
  if (node.type === 'nosecone' || node.type === 'transition') {
    const { fore, aft } = profileEnds(node);
    const pts = nodeOuterProfile(node, partLength(node), fore, aft, WET_AREA_STEPS);
    let area = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, r0] = pts[i - 1]!;
      const [x1, r1] = pts[i]!;
      area += Math.PI * (r0 + r1) * Math.hypot(x1 - x0, r1 - r0);
    }
    return area;
  }
  if (isPlanarFinSet(node.type)) {
    return 2 * finPlanformArea(finPlanformPoints(node) ?? []) * num(node, 'finCount', 3);
  }
  return null;
}

/** As RocketDesignDTO.getPredominantFinish; ties go to the first in Finish order, as desktop's EnumMap iterates. */
export function designSurface(w: Cdx1Writer, stagesIn: ComponentNode[]): string {
  const areas = new Map<string, number>();
  for (const n of walkNodes(stagesIn)) {
    const area = wetArea(n);
    if (area === null) continue;
    const finish = str(n, 'finish', 'normal');
    areas.set(finish, (areas.get(finish) ?? 0) + area);
  }
  if (areas.size === 0) return RASAERO_SURFACE_DEFAULT;
  const order = [...FINISH_TO_SURFACE.keys()];
  const rank = (f: string) => (order.includes(f) ? order.indexOf(f) : order.length);
  const [finish] = [...areas].reduce((best, next) =>
    next[1] > best[1] || (next[1] === best[1] && rank(next[0]) < rank(best[0])) ? next : best,
  );
  if (areas.size > 1) {
    w.warn({
      key: 'errors.exportRasaeroSurfaceMixed',
      values: { finish: FINISH_TO_SURFACE.has(finish) ? { key: `finish.${finish}` } : finish },
    });
  }
  const mapped = rasaeroSurface(finish);
  if (mapped.warning) w.warn(mapped.warning);
  return mapped.surface;
}
