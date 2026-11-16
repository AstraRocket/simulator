import { describe, it, expect } from 'vitest';
import { confirmDelete, useConfirmStore } from '../../src/state/confirmStore';

describe('confirmDelete', () => {
  it('asks with a red Delete button and answers with the choice', async () => {
    const answer = confirmDelete('Delete the thing?');
    const { request } = useConfirmStore.getState();
    expect(request).toMatchObject({ message: 'Delete the thing?', confirmLabel: 'Delete', danger: true });
    useConfirmStore.getState().settle(true);
    await expect(answer).resolves.toBe(true);
  });
});
