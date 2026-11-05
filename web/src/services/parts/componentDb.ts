// SI units throughout (m, kg/m^3).
import { fetchCatalog } from '../app/remoteData';
import { noteCatalogLoad } from '../app/catalogUpdates';
import type { ComponentNode, NoseShape } from '../../engine/openRocketEngine';
import { isFiniteNumber } from '../app/numbers';
import { PROFILE_SHAPES } from '../../tree/shapeProfile';

interface ComponentBase {
  mfr: string;
  partNo: string;
  desc: string;
  /** kg. Parachutes and rail buttons apply it as an override; others fold it into `materialDensity`. */
  mass?: number;
  /** The `.ork` link is invalid without it. */
  digest?: string;
  legacy?: true;
  // Only on saved parts (customParts.ts).
  id?: string;
  custom?: true;
  patch?: Partial<ComponentNode>;
}

export interface BodyTubeComponent extends ComponentBase {
  type: 'bodytube';
  material?: string;
  materialDensity: number;
  outerDiameter: number;
  innerDiameter: number | null;
  length: number;
}

interface NoseConeComponent extends ComponentBase {
  type: 'nosecone';
  material?: string;
  materialDensity: number;
  shape: NoseShape;
  filled: boolean;
  thickness?: number | null;
  outerDiameter: number;
  length: number;
  shoulderDiameter?: number | null;
  shoulderLength?: number | null;
}

export interface ParachuteComponent extends ComponentBase {
  type: 'parachute';
  diameter: number;
  cd: number | null;
  lineCount?: number;
  lineLength?: number;
  packedLength?: number;
  packedDiameter?: number;
  /** Surface material: density per square meter. */
  material?: string;
  materialDensity?: number;
  /** Line material: density per meter. */
  lineMaterial?: string;
  lineMaterialDensity?: number;
}

export interface TubeComponent extends ComponentBase {
  type: 'tubecoupler' | 'centeringring' | 'engineblock' | 'launchlug';
  material?: string;
  materialDensity: number;
  outerDiameter: number;
  innerDiameter: number | null;
  length: number;
}

interface BulkHeadComponent extends ComponentBase {
  type: 'bulkhead';
  material?: string;
  materialDensity: number;
  outerDiameter: number;
  length: number;
  filled: boolean;
}

interface TransitionComponent extends ComponentBase {
  type: 'transition';
  material?: string;
  materialDensity: number;
  shape: NoseShape;
  filled: boolean;
  thickness: number | null;
  length: number;
  foreOuterDiameter: number;
  foreShoulderDiameter: number | null;
  foreShoulderLength: number | null;
  aftOuterDiameter: number;
  aftShoulderDiameter: number | null;
  aftShoulderLength: number | null;
}

/** Surface material: density per square meter. */
interface StreamerComponent extends ComponentBase {
  type: 'streamer';
  material?: string;
  materialDensity: number;
  stripLength: number;
  stripWidth: number;
}

interface RailButtonComponent extends ComponentBase {
  type: 'railbutton';
  material?: string;
  materialDensity: number;
  outerDiameter: number;
  innerDiameter: number | null;
  height: number;
  baseHeight: number | null;
  flangeHeight: number | null;
  screwHeight: number | null;
  cd: number | null;
}

interface ComponentMap {
  bodytube: BodyTubeComponent;
  nosecone: NoseConeComponent;
  parachute: ParachuteComponent;
  tubecoupler: TubeComponent;
  centeringring: TubeComponent;
  bulkhead: BulkHeadComponent;
  transition: TransitionComponent;
  engineblock: TubeComponent;
  launchlug: TubeComponent;
  streamer: StreamerComponent;
  railbutton: RailButtonComponent;
}

/** A transition's aft end: it meets the tube below. */
export function outerDiameterOf(p: Component): number | null {
  switch (p.type) {
    case 'parachute':
      return p.diameter;
    case 'transition':
      return p.aftOuterDiameter;
    case 'streamer':
      return null;
    default:
      return p.outerDiameter;
  }
}

export function lengthOf(p: Component): number | null {
  if (p.type === 'parachute') return null;
  if (p.type === 'railbutton') return p.height;
  return p.type === 'streamer' ? p.stripLength : p.length;
}

export type ComponentType = keyof ComponentMap;
export type Component = ComponentMap[ComponentType];

/** An inner tube picks from body tubes, as desktop does. */
export type PickerType = ComponentType | 'innertube';

export const catalogTypeFor = (t: PickerType): ComponentType => (t === 'innertube' ? 'bodytube' : t);

interface ComponentCatalog {
  generated: string;
  count: number;
  components: Component[];
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNullableFinite = (v: unknown): boolean => v === null || isFiniteNumber(v);
const isPositive = (v: unknown): boolean => isFiniteNumber(v) && v > 0;
const isNonNegative = (v: unknown): boolean => isFiniteNumber(v) && v >= 0;
const isNullableNonNegative = (v: unknown): boolean => v === null || isNonNegative(v);
const isOptionalSize = (v: unknown): boolean => v === undefined || isNullableNonNegative(v);

/** An unknown shape would otherwise silently fall back to a different one. */
const KNOWN_SHAPES: ReadonlySet<string> = new Set(PROFILE_SHAPES);
const isShape = (v: unknown): boolean => typeof v === 'string' && KNOWN_SHAPES.has(v);

/** A missing size would silently become a NaN radius in `treeEdit.catalogPatch`. */
// eslint-disable-next-line complexity -- a flat list of field checks
export function isComponentRow(v: unknown): v is Component {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  if (!isStr(r.mfr) || !isStr(r.partNo) || !isStr(r.desc)) return false;
  if (r.mass !== undefined && !isNonNegative(r.mass)) return false;
  if ([r.material, r.digest].some((s) => s !== undefined && !isStr(s))) return false;
  if (r.legacy !== undefined && r.legacy !== true) return false;
  switch (r.type) {
    case 'bodytube':
    case 'tubecoupler':
    case 'centeringring':
    case 'engineblock':
    case 'launchlug':
      return (
        isNonNegative(r.materialDensity) &&
        isPositive(r.outerDiameter) &&
        isNullableNonNegative(r.innerDiameter) &&
        isPositive(r.length)
      );
    case 'nosecone':
      return (
        isNonNegative(r.materialDensity) &&
        isShape(r.shape) &&
        typeof r.filled === 'boolean' &&
        isPositive(r.outerDiameter) &&
        isPositive(r.length) &&
        [r.thickness, r.shoulderDiameter, r.shoulderLength].every(isOptionalSize)
      );
    case 'bulkhead':
      return (
        isNonNegative(r.materialDensity) &&
        isPositive(r.outerDiameter) &&
        isPositive(r.length) &&
        typeof r.filled === 'boolean'
      );
    case 'parachute':
      return (
        isPositive(r.diameter) &&
        isNullableFinite(r.cd) &&
        [r.lineCount, r.lineLength, r.packedLength, r.packedDiameter, r.materialDensity, r.lineMaterialDensity].every(
          (v) => v === undefined || isNonNegative(v),
        ) &&
        (r.lineMaterial === undefined || isStr(r.lineMaterial))
      );
    case 'transition':
      return (
        isNonNegative(r.materialDensity) &&
        isShape(r.shape) &&
        typeof r.filled === 'boolean' &&
        isNullableNonNegative(r.thickness) &&
        isPositive(r.length) &&
        // One end may close to a point, as a tail cone does; not both.
        isNonNegative(r.foreOuterDiameter) &&
        isNonNegative(r.aftOuterDiameter) &&
        (isPositive(r.foreOuterDiameter) || isPositive(r.aftOuterDiameter)) &&
        isNullableNonNegative(r.foreShoulderDiameter) &&
        isNullableNonNegative(r.foreShoulderLength) &&
        isNullableNonNegative(r.aftShoulderDiameter) &&
        isNullableNonNegative(r.aftShoulderLength)
      );
    case 'streamer':
      return isNonNegative(r.materialDensity) && isPositive(r.stripLength) && isPositive(r.stripWidth);
    case 'railbutton':
      return (
        isNonNegative(r.materialDensity) &&
        isPositive(r.outerDiameter) &&
        isPositive(r.height) &&
        [r.innerDiameter, r.baseHeight, r.flangeHeight, r.screwHeight].every(isNullableNonNegative) &&
        isNullableFinite(r.cd)
      );
    default:
      return false;
  }
}

/** Security: a served row with `patch` could write any node key. */
function catalogRow(v: unknown): unknown {
  if (!v || typeof v !== 'object') return v;
  const { custom: _custom, patch: _patch, id: _id, ...row } = v as Record<string, unknown>;
  return row;
}

/** The data host can serve `{"error":"rebuilding"}` with HTTP 200. */
export const isComponentCatalog = (v: unknown): v is { components: unknown[] } =>
  !!v && typeof v === 'object' && Array.isArray((v as { components?: unknown }).components);

let catalogP: Promise<ComponentCatalog> | null = null;
export function loadCatalog(): Promise<ComponentCatalog> {
  if (!catalogP) {
    catalogP = fetchCatalog<ComponentCatalog & { components: unknown[] }>('components', isComponentCatalog).then(
      (cat) => {
        const components = cat.components.map(catalogRow).filter(isComponentRow);
        noteCatalogLoad('components', () => components.map((c) => `${c.type}|${c.mfr}|${c.partNo}`));
        return { ...cat, components };
      },
    );
    // Don't memoize a failure, or every retry replays it.
    catalogP.catch(() => (catalogP = null));
  }
  return catalogP;
}

export function projectByType<T extends ComponentType>(cat: ComponentCatalog, type: T): ComponentMap[T][] {
  return cat.components.filter((p): p is ComponentMap[T] => p.type === type);
}

export async function componentsForType<T extends ComponentType>(type: T): Promise<ComponentMap[T][]> {
  return projectByType(await loadCatalog(), type);
}
