// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const assembleReport = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/report/reportModel', () => ({ assembleReport }));
vi.mock('../../src/services/report/designInfo', () => ({ buildDesignInfo: (r: unknown) => r }));

const downloadOrk = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/files/saveOrk', () => ({ downloadOrk }));

const digests = vi.hoisted(() => ({ release: null as null | (() => void) }));
vi.mock('../../src/services/motors/exportMotors', async (orig) => ({
  ...(await orig<typeof import('../../src/services/motors/exportMotors')>()),
  fillMotorDigests: (m: unknown) =>
    new Promise((res) => {
      digests.release = () => res(m);
    }),
}));

const computeStaticInfo = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/design/buildRocket', async (orig) => ({
  ...(await orig<typeof import('../../src/services/design/buildRocket')>()),
  computeStaticInfo,
}));

import { useWorkspaceStore } from '../../src/state/store';
import { loadSettings, saveSettings } from '../../src/services/storage/settings';

const s = () => useWorkspaceStore.getState();

async function releaseDigests() {
  await vi.waitFor(() => expect(digests.release).not.toBeNull());
  digests.release!();
}

beforeEach(() => {
  localStorage.clear();
  saveSettings({ ...loadSettings(), saveDesignInfo: true });
  s().resetWorkspace();
  digests.release = null;
  downloadOrk.mockReset();
  computeStaticInfo.mockReset().mockReturnValue({ info: {}, rocket: {} });
  assembleReport.mockReset().mockImplementation(() => ({ tree: useWorkspaceStore.getState().tree }));
  useWorkspaceStore.setState({ info: {} as never, rocket: {} as never });
});

describe('saveOrk with design info', () => {
  it('describes the design as it was saved, not as it was edited during the save', async () => {
    const saving = s().saveOrk();
    await vi.waitFor(() => expect(assembleReport).toHaveBeenCalled());
    s().setSelectedId('nose');
    s().patchSelected({ length: 0.42 });
    await releaseDigests();
    await saving;

    const written = downloadOrk.mock.calls[0]![0] as { tree: unknown; designInfo?: { tree: unknown } };
    expect(written.designInfo?.tree).toBe(written.tree);
  });

  it('builds the design when it has not been built yet, rather than leaving the block out', async () => {
    useWorkspaceStore.setState({ info: null, rocket: null });
    computeStaticInfo.mockReturnValue({ info: { mass: 1 }, rocket: {} });
    const saving = s().saveOrk();
    await releaseDigests();
    await saving;

    expect(computeStaticInfo).toHaveBeenCalledTimes(1);
    expect((downloadOrk.mock.calls[0]![0] as { designInfo?: unknown }).designInfo).toBeTruthy();
  });

  it('writes the file and says so when the block cannot be built', async () => {
    useWorkspaceStore.setState({ info: null, rocket: null, err: null });
    computeStaticInfo.mockReturnValue({ error: 'engine not loaded' });
    assembleReport.mockImplementation(() => (useWorkspaceStore.getState().info ? {} : null));
    const saving = s().saveOrk();
    await releaseDigests();
    await saving;

    expect(downloadOrk).toHaveBeenCalledTimes(1);
    expect((downloadOrk.mock.calls[0]![0] as { designInfo?: unknown }).designInfo).toBeUndefined();
    expect(s().err).toMatch(/without design info/);
  });

  it('says nothing when the block was written', async () => {
    useWorkspaceStore.setState({ err: null });
    const saving = s().saveOrk();
    await releaseDigests();
    await saving;
    expect(s().err).toBeNull();
  });
});
