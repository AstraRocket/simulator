// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

const pending = new Map<string, (bytes: ArrayBuffer) => void>();
vi.mock('../../src/services/storage/exampleLibrary', async (original) => ({
  ...(await original<typeof import('../../src/services/storage/exampleLibrary')>()),
  fetchExample: (file: string) => new Promise<ArrayBuffer>((resolve) => pending.set(file, resolve)),
}));

import { useWorkspaceStore } from '../../src/state/store';

describe('two examples opened quickly', () => {
  it('opens the later one, even when the first arrives last', async () => {
    const opened: number[] = [];
    useWorkspaceStore.setState({
      openOrkFile: async (blob: Blob) => {
        opened.push((await blob.arrayBuffer()).byteLength);
      },
    });
    const { openExample } = useWorkspaceStore.getState();
    const first = openExample('first.ork');
    const second = openExample('second.ork');
    pending.get('second.ork')!(new ArrayBuffer(2));
    await second;
    pending.get('first.ork')!(new ArrayBuffer(1));
    await first;
    expect(opened).toEqual([2]);
    expect(useWorkspaceStore.getState().err).toBeNull();
  });
});
