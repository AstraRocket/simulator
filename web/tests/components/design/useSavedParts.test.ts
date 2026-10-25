// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../../src/services/parts/customParts', async (orig) => ({
  ...(await orig<typeof import('../../../src/services/parts/customParts')>()),
  listSavedParts: () => Promise.reject(new Error('IndexedDB is unavailable')),
}));

const { useSavedParts } = await import('../../../src/components/design/useSavedParts');

/**
 * A store that cannot be read is not an empty one: read as an empty list, Custom
 * Parts would say "nothing saved" over a database that has parts. The failure is
 * reported instead, as Custom Materials reports its own.
 */
describe('useSavedParts when storage fails', () => {
  it('reports the failure rather than reading it as no parts', async () => {
    const { result } = renderHook(() => useSavedParts());
    await waitFor(() => expect(result.current.error).toMatch(/IndexedDB is unavailable/));
  });
});
