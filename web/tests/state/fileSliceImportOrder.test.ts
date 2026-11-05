import { describe, it, expect, vi } from 'vitest';

// store.ts calls the slice creators while loading; a run-time import of store from a slice would hit the TDZ.
describe.each([
  ['fileSlice', 'createFileSlice'],
  ['designLibrarySlice', 'createDesignLibrarySlice'],
  ['exportSlice', 'createExportSlice'],
])('%s import order', (file, creator) => {
  it('loads before the store without a TDZ error', async () => {
    vi.resetModules();
    await expect(import(`../../src/state/${file}.ts`)).resolves.toHaveProperty(creator);
    const { useWorkspaceStore } = await import('../../src/state/store');
    expect(typeof useWorkspaceStore.getState().saveDesignAs).toBe('function');
  });
});
