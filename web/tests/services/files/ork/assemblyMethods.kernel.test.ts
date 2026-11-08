// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ComponentNode, RocketTree } from '../../../../src/engine/openRocketEngine';
import { importOrk } from '../../../../src/services/files/orkFile';
import { exportOrk } from '../../../../src/services/files/orkExport';
import { walkNodes } from '../../../../src/tree/treeWalk';
import { loadEngine } from '../../../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

/* eslint-disable @typescript-eslint/no-explicit-any -- the TeaVM bundle is untyped */
let engine: any;
beforeAll(async () => {
  engine = await loadEngine();
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// The kernel places pods by `<radiusoffset method>` (RadiusMethod.java).

const ork = (method: string) =>
  `<?xml version='1.0' encoding='utf-8'?>
<openrocket version="1.10" creator="test"><rocket><name>R</name><subcomponents>
<stage><name>S</name><subcomponents>
<bodytube><name>B</name><length>0.3</length><radius>0.025</radius><subcomponents>
<podset><name>Pods</name><instancecount>2</instancecount>
<radiusoffset method="${method}">0.04</radiusoffset><angleoffset method="relative">0</angleoffset>
<subcomponents><bodytube><name>P</name><length>0.1</length><radius>0.01</radius></bodytube></subcomponents>
</podset></subcomponents></bodytube></subcomponents></stage>
</subcomponents></rocket></openrocket>`;

const pods = (tree: RocketTree): ComponentNode => [...walkNodes(tree.components)].find((n) => n.type === 'podset')!;

function kernelMethod(tree: RocketTree): string {
  engine.reset();
  const handle = engine.buildRocket(JSON.stringify(tree));
  const fields = JSON.parse(engine.getComponentFields(handle, pods(tree).id!)) as Record<string, unknown>;
  if (typeof fields.error === 'string') throw new Error(fields.error);
  return String(fields.radiusMethod);
}

describe("a pod set's radius method", () => {
  it.each(['free', 'relative', 'surface', 'coaxial'])('flies and saves as %s', (method) => {
    const opened = importOrk(ork(method)).tree;
    expect(kernelMethod(opened)).toBe(method);
    const again = importOrk(exportOrk({ name: 'R', tree: opened } as never)).tree;
    expect(pods(again)['radiusMethod']).toBe(method);
    expect(kernelMethod(again)).toBe(method);
  });
});
