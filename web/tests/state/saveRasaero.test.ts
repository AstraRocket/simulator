import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '../../src/state/store';
import { selectConfig } from '../../src/state/workspaceSelectors';
import { saveBlob } from '../../src/services/files/saveFile';
import type { RocketTree } from '../../src/engine/openRocketEngine';

// saveBlob needs a browser; the test reads the blob it was handed.
vi.mock('../../src/services/files/saveFile', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/services/files/saveFile')>();
  const saveBlob = vi.fn(async (_blob: Blob, _name: string) => true);
  // The real `saveText` calls its own module's `saveBlob`, so it is routed through the mock.
  const saveText = (text: string, name: string, mime?: string) => saveBlob(new Blob([text], { type: mime }), name);
  return { ...real, saveBlob, saveText };
});

const s = () => useWorkspaceStore.getState();

const tree = {
  name: 'x',
  components: [
    {
      type: 'stage',
      id: 'st',
      children: [
        { type: 'nosecone', id: 'nc', length: 0.1, aftRadius: 0.0124, shape: 'ogive', thickness: 0.001 },
        {
          type: 'bodytube',
          id: 'bt',
          length: 0.3,
          outerRadius: 0.0124,
          thickness: 0.0004,
          children: [{ type: 'parachute', id: 'chute', name: 'Main', deployEvent: 'ejection' }],
        },
      ],
    },
  ],
} as unknown as RocketTree;

beforeEach(() => {
  s().resetWorkspace();
  useWorkspaceStore.setState({ err: null, tree, info: { mass: 0.1, cg: 0.2 } as never });
  vi.mocked(saveBlob).mockClear();
});

describe('saveRasaero', () => {
  it("exports the selected configuration's deployment, not the design's", async () => {
    const active = selectConfig(s());
    useWorkspaceStore.setState({
      configs: s().configs.map((c) =>
        c.id === active.id ? { ...c, deployments: { chute: { deployEvent: 'apogee' as const } } } : c,
      ),
    });
    await s().saveRasaero();
    expect(s().err).toBeNull();
    const blob = vi.mocked(saveBlob).mock.calls[0]![0];
    expect(await blob.text()).toContain('<EventType1>Apogee</EventType1>');
  });

  // RASAero has no ejection charge: desktop writes it as apogee and warns.
  it("writes the design's own ejection charge as apogee, with a warning", async () => {
    await s().saveRasaero();
    expect(s().err).toContain('"Main"');
    expect(s().err).toContain('apogee');
    const blob = vi.mocked(saveBlob).mock.calls[0]![0];
    expect(await blob.text()).toContain('<EventType1>Apogee</EventType1>');
  });

  it("refuses an event RASAero has no deployment for, with the configuration's override", async () => {
    const active = selectConfig(s());
    useWorkspaceStore.setState({
      configs: s().configs.map((c) =>
        c.id === active.id ? { ...c, deployments: { chute: { deployEvent: 'never' as const } } } : c,
      ),
    });
    await s().saveRasaero();
    expect(s().err).toContain('"Main"');
    expect(saveBlob).not.toHaveBeenCalled();
  });
});
