import type { ComponentNode, RocketTree } from '../../src/engine/openRocketEngine';

export interface KernelGeometry {
  length: number;
  foreRadius?: number;
  aftRadius?: number;
  /** Outer radius at evenly spaced stations from the front, both ends included. */
  profile?: (number | null)[];
  innerProfile?: (number | null)[];
  outerRadius?: number;
  innerRadius?: number;
  maxTabHeight?: number;
  /** `[x, y]`: x from the fin front, y from the body surface there. */
  finPoints?: [number | null, number | null][];
  rootPoints?: [number | null, number | null][];
  tabPoints?: [number | null, number | null][];
  instanceRadius?: number;
  /** [y, z] per cluster tube (`getInstanceOffsets`). */
  clusterPoints?: [number, number][];
  radius?: number;
  outerDiameter?: number;
  innerDiameter?: number;
  totalHeight?: number;
  baseHeight?: number;
  flangeHeight?: number;
  /** The first copy's front, from the nose tip. */
  positionX?: number;
  /** Read after every geometry read: the length moves when an automatic radius settles. */
  settledLength?: number;
  mass?: number;
  /** Read last. */
  fields?: Record<string, number | string | boolean>;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the TeaVM bundle is untyped */
export const loadEngine = async (): Promise<any> => {
  (globalThis as any).$rt_putStdoutCustom ??= () => {};
  (globalThis as any).$rt_putStderrCustom ??= () => {};
  return import('../../src/engine/vendor/openrocket-engine.mjs' as string);
};

/** `parentId` is '' for a top-level node. */
export interface Visit {
  node: ComponentNode;
  id: string;
  parent: ComponentNode | null;
  parentId: string;
}

export function walkTree(tree: RocketTree): Visit[] {
  const out: Visit[] = [];
  const visit = (node: ComponentNode, parent: ComponentNode | null) => {
    out.push({ node, id: node.id ?? '', parent, parentId: parent?.id ?? '' });
    for (const kid of node.children ?? []) visit(kid, node);
  };
  for (const top of tree.components) visit(top, null);
  return out;
}

export function kernelGeometry(
  engine: any,
  tree: RocketTree,
  options: { fields?: boolean } = {},
): Map<string, KernelGeometry> {
  engine.reset();
  const handle: number = engine.buildRocket(JSON.stringify(tree));
  const out = new Map<string, KernelGeometry>();
  for (const { node, id } of walkTree(tree)) {
    if (node.type === 'stage') continue;
    const json = JSON.parse(engine.getComponentGeometry(handle, id) as string) as KernelGeometry & {
      error?: string;
    };
    if (json.error) throw new Error(`${id}: ${json.error}`);
    out.set(id, json);
  }
  // Reading anything between geometry reads changes the kernel's evaluation order.
  for (const [id, geometry] of out) {
    const info = JSON.parse(engine.getComponentInfo(handle, id) as string) as {
      positionX?: number;
      length?: number;
      mass?: number;
      error?: string;
    };
    if (info.error) throw new Error(`${id}: ${info.error}`);
    geometry.positionX = info.positionX;
    geometry.settledLength = info.length;
    geometry.mass = info.mass;
  }
  if (options.fields) {
    for (const [id, geometry] of out) {
      const fields = JSON.parse(engine.getComponentFields(handle, id) as string) as Record<
        string,
        number | string | boolean
      >;
      if (fields['error']) throw new Error(`${id}: ${String(fields['error'])}`);
      geometry.fields = fields;
    }
  }
  return out;
}
