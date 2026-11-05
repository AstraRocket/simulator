// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { __setEngineForTests } from '../../src/engine/openRocketEngine';
import { KERNEL_TEST_TIMEOUT_MS } from '../testing/kernelTimeout';
import { loadEngine } from '../testing/kernelGeometry';

const downloadOrk = vi.hoisted(() => vi.fn());
const downloadRkt = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/files/saveOrk', () => ({ downloadOrk, downloadRkt }));

const digests = vi.hoisted(() => ({ hold: false, release: null as null | (() => void) }));
vi.mock('../../src/services/motors/exportMotors', async (orig) => ({
  ...(await orig<typeof import('../../src/services/motors/exportMotors')>()),
  fillMotorDigests: (m: unknown) =>
    digests.hold ? new Promise((res) => (digests.release = () => res(m))) : Promise.resolve(m),
}));

import { useWorkspaceStore, selectConfig, workspaceSnapshot } from '../../src/state/store';
import { computeStaticInfo } from '../../src/services/design/buildRocket';
import { updateNode } from '../../src/services/design/treeEdit';
import type { RocketTree } from '../../src/engine/openRocketEngine';
import type { ComponentFigures, StageFigures } from '../../src/services/files/rktExport';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the TeaVM bundle is untyped
let engine: any;
beforeAll(async () => {
  engine = await loadEngine();
  __setEngineForTests(engine);
});

const s = () => useWorkspaceStore.getState();

const kernelCordLength = (tree: RocketTree): number => {
  const h = engine.buildRocket(JSON.stringify(tree));
  return (JSON.parse(engine.getComponentInfo(h, 'cord')) as { cordLength: number }).cordLength;
};

const rebuild = () => {
  const built = computeStaticInfo(s().tree, selectConfig(s()));
  if ('error' in built) throw new Error(JSON.stringify(built.error));
  s().applyBuild(built.info, built.rocket);
};

const lengthen = () => {
  s().setSelectedId('body');
  s().patchSelected({ length: 0.6 });
};

beforeEach(() => {
  downloadOrk.mockReset();
  downloadRkt.mockReset().mockResolvedValue([]);
  digests.hold = false;
  digests.release = null;
  s().resetWorkspace();
  const w = workspaceSnapshot(s());
  s().hydrate({ ...w, tree: updateNode(w.tree, 'cord', { cordLengthAuto: true } as never) });
  rebuild();
});

const cordIn = (figures: ComponentFigures | undefined) => figures?.('cord')?.cordLength;

describe('the kernel figures a saved file carries', () => {
  it('.ork: are those of the saved tree when the build still describes an earlier one', async () => {
    const earlier = kernelCordLength(s().tree);
    lengthen();
    const saved = s().tree;
    const expected = kernelCordLength(saved);
    expect(expected).not.toBeCloseTo(earlier, 6);

    await s().saveOrk();
    const written = downloadOrk.mock.calls[0]![0] as { tree: RocketTree; componentInfo?: ComponentFigures };
    expect(written.tree).toBe(saved);
    expect(cordIn(written.componentInfo)).toBeCloseTo(expected, 12);
  });

  it('.ork: are those of the saved tree when the design is rebuilt during the save', async () => {
    const saved = s().tree;
    const expected = kernelCordLength(saved);
    digests.hold = true;
    const saving = s().saveOrk();
    await vi.waitFor(() => expect(digests.release).not.toBeNull());
    lengthen();
    rebuild();
    expect(kernelCordLength(s().tree)).not.toBeCloseTo(expected, 6);
    digests.release!();
    await saving;

    const written = downloadOrk.mock.calls[0]![0] as { tree: RocketTree; componentInfo?: ComponentFigures };
    expect(written.tree).toBe(saved);
    expect(cordIn(written.componentInfo)).toBeCloseTo(expected, 12);
  });

  it('.rkt: are those of the saved tree when the build still describes an earlier one', async () => {
    const earlier = kernelCordLength(s().tree);
    lengthen();
    const saved = s().tree;
    const expected = kernelCordLength(saved);
    expect(expected).not.toBeCloseTo(earlier, 6);

    await s().saveRkt();
    const [, tree, figures] = downloadRkt.mock.calls[0]! as [string, RocketTree, ComponentFigures | undefined];
    expect(tree).toBe(saved);
    expect(cordIn(figures)).toBeCloseTo(expected, 12);
  });

  it('.rkt: carry the stage figures when a stage overrides its mass', async () => {
    const w = workspaceSnapshot(s());
    const stageId = w.tree.components[0]!.id!;
    s().hydrate({
      ...w,
      tree: updateNode(w.tree, stageId, { overrideMass: 0.2, overrideSubcomponentsMass: true } as never),
    });
    rebuild();
    const before = s().rocket!.staticInfo();

    await s().saveRkt();
    const stages = downloadRkt.mock.calls[0]![3] as StageFigures[] | undefined;
    expect(stages?.[0]?.mass).toBeCloseTo(0.2, 9);
    const after = s().rocket!.staticInfo();
    expect(after.massEmpty).toBeCloseTo(before.massEmpty, 12);
    expect(after.cgEmpty).toBeCloseTo(before.cgEmpty, 12);
  });

  it('.rkt: carry no stage figures when no stage overrides', async () => {
    await s().saveRkt();
    expect(downloadRkt.mock.calls[0]![3]).toBeUndefined();
  });
});
