import type { ComponentNode } from '../../../engine/openRocketEngine';
import type { Keyed } from '../../../i18n/keyedError';
import type { Cdx1Writer } from './units';
import { bodyTubeRadius, num, numOpt, str } from '../../../tree/nodeProps';
import { partLength } from '../../../tree/position';
import { nodeShape, outerProfile, profileEnds } from '../../../tree/shapeProfile';
import { finPlanformPoints } from '../../../tree/finPlanform';
import { isPlanarFinSet } from '../../../tree/tubefins';
import { walkNodes } from '../../../tree/treeWalk';

/**
 * Surface and airfoil mapping: our finish ids and airfoil-section ids to the
 * strings RASAero's global <Surface> and per-fin <AirfoilSection> accept.
 */

/**
 * Our airfoilSection ids → RASAero's supersonic airfoil strings.
 *
 * Both tables here are Maps, not plain objects: the id and the finish are
 * free text a file carried, and `constructor` on a plain object would resolve
 * to an Object.prototype member and write a function's source into the file.
 */
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

/**
 * Our finish ids (the .ork spelling: ExternalComponent.Finish lowercased) to
 * RASAero's global surface strings, transcribed from the desktop's
 * RASAeroCommonConstants.OPENROCKET_TO_RASAERO_SURFACE, in ExternalComponent
 * .Finish order. `polished` shares Polished and `rough` Cast Iron, the nearest
 * RASAero roughnesses, as desktop maps them. A finish with no row (text a file
 * carried) takes {@link RASAERO_SURFACE_DEFAULT} with a warning, as the
 * table's `else` branch does.
 */
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

/** The warning the desktop raises when a finish has no RASAero row. */
export const RASAERO_SURFACE_WARNING: Keyed = { key: 'errors.exportRasaeroSurface' };

/** The RASAero surface for a finish id, with the desktop's warning when it has no row. */
export function rasaeroSurface(finish: string): { surface: string; warning?: Keyed } {
  const surface = FINISH_TO_SURFACE.get(finish);
  if (surface) return { surface };
  return { surface: RASAERO_SURFACE_DEFAULT, warning: RASAERO_SURFACE_WARNING };
}

/** Profile samples per nose cone or transition for its wetted area. */
const WET_AREA_STEPS = 128;

/**
 * The outside area (m^2) a part puts in the air, as desktop weighs finishes:
 * a nose cone, tube or transition's lateral surface
 * (`SymmetricComponent.getComponentWetArea`), and both faces of every fin of
 * a planar fin set (`2 * getPlanformArea() * getFinCount()`). Null for any
 * other part.
 */
function wetArea(node: ComponentNode): number | null {
  if (node.type === 'bodytube') return 2 * Math.PI * bodyTubeRadius(node) * partLength(node);
  if (node.type === 'nosecone' || node.type === 'transition') {
    const { fore, aft } = profileEnds(node);
    const clipped = typeof node['clipped'] === 'boolean' ? node['clipped'] : undefined;
    const pts = outerProfile(
      nodeShape(node),
      numOpt(node, 'shapeParameter'),
      partLength(node),
      fore,
      aft,
      WET_AREA_STEPS,
      undefined,
      clipped,
    );
    let area = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, r0] = pts[i - 1]!;
      const [x1, r1] = pts[i]!;
      area += Math.PI * (r0 + r1) * Math.hypot(x1 - x0, r1 - r0);
    }
    return area;
  }
  if (isPlanarFinSet(node.type)) {
    const pts = finPlanformPoints(node) ?? [];
    let twice = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i]!;
      const [x1, y1] = pts[(i + 1) % pts.length]!;
      twice += x0 * y1 - x1 * y0;
    }
    return Math.abs(twice) * num(node, 'finCount', 3);
  }
  return null;
}

/**
 * Global surface: RASAero has one finish for the whole rocket, so the finish
 * of most of its wetted area, as desktop's RocketDesignDTO.getPredominantFinish
 * picks it, with a warning when the parts carry several. A tie goes to the
 * finish first in ExternalComponent.Finish order, as desktop's EnumMap has
 * it. A part with no finish key has the kernel's default, NORMAL. A rocket
 * with no outside surface keeps RASAero's default, as desktop leaves it.
 */
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
