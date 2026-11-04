import { describe, it, expect, vi } from 'vitest';

// store.ts calls `createFileSlice` while loading; a run-time import of store from fileSlice would hit the TDZ.
describe('fileSlice import order', () => {
  it('loads before the store without a TDZ error', async () => {
    vi.resetModules();
    await expect(import('../../src/state/fileSlice')).resolves.toHaveProperty('createFileSlice');
    const { useWorkspaceStore } = await import('../../src/state/store');
    expect(typeof useWorkspaceStore.getState().saveDesignAs).toBe('function');
  });
});
