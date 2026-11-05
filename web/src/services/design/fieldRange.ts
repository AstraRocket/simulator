import type { ComponentInfo, ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { KERNEL_DEFAULTS, KERNEL_DEPLOYMENT, KERNEL_SEPARATION } from '../../tree/kernelDefaults';
import { MAX_CANT, MAX_FIN_COUNT, MAX_INSTANCE_COUNT, MAX_LINE_COUNT, num, str } from '../../tree/nodeProps';
import { shapeIsClippable, shapeParamDefault, shapeParamMax, shapeUsesParameter } from '../../tree/shapeProfile';
import { clusterCount } from '../../tree/cluster';
import { axialLength } from '../../tree/position';
import type { DimensionBounds } from './linkedDimensions';
import type { Field } from './componentFields';

export type FieldRange = { min?: number; max?: number };

/** `ComponentFactory` reads ogive for a nose cone and conical for a transition. */
const defaultShape = (node: ComponentNode): string =>
  str(node, 'shape', node.type === 'nosecone' ? 'ogive' : 'conical');

/** Shared by `visibleFields` and `sectionFields`; a test in only one would hide a row in one place but not the other. */
export function fieldApplies(node: ComponentNode, f: Field): boolean {
  if (f.key === 'shapeParameter') return shapeUsesParameter(defaultShape(node));
  // `Transition.isClipped()` returns false outright for an unclippable shape.
  if (f.key === 'clipped') return shapeIsClippable(defaultShape(node));
  if (f.key === 'thickness' || f.key === 'innerDiameter') return node['filled'] !== true;
  if (f.key === 'clusterScale' || f.key === 'clusterSeparation' || f.key === 'clusterRotation') {
    return clusterCount(str(node, 'cluster', 'single')) > 1;
  }
  if (f.key === 'deployAltitude') return str(node, 'deployEvent', KERNEL_DEPLOYMENT.deployEvent) === 'altitude';
  if (f.key === 'motorOverhang' || f.key === 'ignitionEvent' || f.key === 'ignitionDelay') {
    if (node['motorMount'] !== true) return false;
    return f.key !== 'ignitionDelay' || str(node, 'ignitionEvent', 'automatic') !== 'never';
  }
  if (f.key === 'separationAltitude') {
    return str(node, 'separationEvent', KERNEL_SEPARATION.separationEvent).startsWith('altitude');
  }
  return true;
}

/** Never fires on the bottom stage; desktop ParachuteConfig/StreamerConfig drop it there. */
export const LOWER_STAGE_SEPARATION = 'lower_stage_separation';

/** Tree order is the kernel's stage numbering (Rocket.trackStage). */
export function hasStageBelow(tree: RocketTree, id: string): boolean {
  const stages: string[] = [];
  let enclosing: string | undefined;
  const visit = (nodes: readonly ComponentNode[], stageId: string | undefined) => {
    for (const n of nodes) {
      const own = (n.type === 'stage' || n.type === 'parallelstage') && typeof n.id === 'string' ? n.id : undefined;
      if (own !== undefined) stages.push(own);
      const here = own ?? stageId;
      if (n.id === id) enclosing = here;
      visit(n.children ?? [], here);
    }
  };
  visit(tree.components ?? [], undefined);
  return enclosing !== undefined && stages.indexOf(enclosing) < stages.length - 1;
}

export function fieldOptions(
  node: ComponentNode,
  f: Extract<Field, { kind: 'select' }>,
  stageBelow: boolean | undefined,
): string[] {
  if (f.key !== 'deployEvent' || stageBelow !== false || node[f.key] === LOWER_STAGE_SEPARATION) return f.options;
  return f.options.filter((o) => o !== LOWER_STAGE_SEPARATION);
}

/** Never written back to the node; on Auto the panel shows the kernel's figure. */
const KERNEL_AUTO = ['cordLength', 'lineLength', 'cd'] as const satisfies readonly (keyof ComponentInfo)[];
const KERNEL_AUTO_KEYS: ReadonlySet<string> = new Set(KERNEL_AUTO);
export const isKernelAutoKey = (key: string): key is (typeof KERNEL_AUTO)[number] => KERNEL_AUTO_KEYS.has(key);

export function liveBounds(f: Field, tabDepth: number | null): DimensionBounds | undefined {
  return f.key === 'tabHeight' && tabDepth != null && Number.isFinite(tabDepth)
    ? { ...f.bounds, max: () => tabDepth }
    : f.bounds;
}

function absentValue(node: ComponentNode, f: Field): number | undefined {
  if (f.whenAbsent !== undefined) return f.whenAbsent;
  if (f.key === 'shapeParameter') return shapeParamDefault(defaultShape(node));
  const tables: Record<string, unknown>[] = [
    (KERNEL_DEFAULTS as Record<string, Record<string, unknown>>)[node.type] ?? {},
    KERNEL_DEPLOYMENT,
    KERNEL_SEPARATION,
  ];
  for (const t of tables) if (typeof t[f.key] === 'number') return t[f.key] as number;
  return undefined;
}

/** Must match what the kernel builds from the same node (`fieldReadback.kernel.test.ts`). */
export function fieldValue(node: ComponentNode, f: Field): number | boolean | string | undefined {
  switch (f.kind) {
    case 'select':
      return typeof node[f.key] === 'string' ? (node[f.key] as string) : (f.fallback ?? f.options[0]);
    case 'bool':
      // Transition.setShapeType sets clipped to isClippable().
      if (f.key === 'clipped' && typeof node[f.key] !== 'boolean') return shapeIsClippable(defaultShape(node));
      return node[f.key] === true;
    case 'length': {
      // Kernel setters clamp, but the BodyTube constructor (ComponentFactory) takes the wall as given.
      const v = num(node, f.key, absentValue(node, f));
      const hi = node.type === 'bodytube' ? undefined : f.bounds?.max?.(node);
      return hi !== undefined && Number.isFinite(hi) && v > hi ? hi : v;
    }
    case 'count':
    case 'number':
    case 'angle':
    case 'mass':
    case 'distance':
      return num(node, f.key, absentValue(node, f));
    default:
      return undefined;
  }
}

/** Every value allowed must be one the kernel keeps (`fieldReadback.kernel.test.ts`). */
export function fieldRange(node: ComponentNode, f: Field, bounds: DimensionBounds | undefined = f.bounds): FieldRange {
  switch (f.kind) {
    case 'count':
      return {
        min: f.key === 'lineCount' ? 0 : 1,
        max: f.key === 'finCount' ? MAX_FIN_COUNT : f.key === 'lineCount' ? MAX_LINE_COUNT : MAX_INSTANCE_COUNT,
      };
    case 'number':
      return f.key === 'shapeParameter' ? { min: 0, max: shapeParamMax(defaultShape(node)) } : { min: 0 };
    case 'angle':
      if (f.key === 'cant') return { min: -MAX_CANT, max: MAX_CANT };
      // Other angles wrap in the kernel; a one-sided bound would clamp -200 to -180 while the kernel flies 160.
      if (f.key === 'radialDirection') return {};
      return { min: -Math.PI, max: Math.PI };
    case 'length': {
      if (f.signed) return {};
      if (f.signedWithinLength) {
        const span = axialLength(node);
        return { min: -span, max: span };
      }
      const lo = bounds?.min?.(node);
      const hi = bounds?.max?.(node);
      return {
        min: lo === undefined || !Number.isFinite(lo) ? 0 : lo,
        ...(hi === undefined || !Number.isFinite(hi) ? {} : { max: hi }),
      };
    }
    case 'mass':
    case 'distance':
      return { min: 0 };
    default:
      return {};
  }
}
