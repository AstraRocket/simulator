// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import '../../../src/i18n';

vi.mock('../../../src/state/confirmStore', () => ({ confirm: vi.fn(async () => true) }));

const { useSelectedComponent } = await import('../../../src/components/design/useSelectedComponent');
const { useWorkspaceStore } = await import('../../../src/state/store');

describe('clearing the last motor mount', () => {
  it('closes its undo entry once confirmed', async () => {
    const tree = {
      name: 'T',
      components: [{ type: 'stage', id: 's', children: [{ type: 'innertube', id: 'm', motorMount: true }] }],
    };
    const order: string[] = [];
    useWorkspaceStore.setState({
      tree: tree as never,
      selectedId: 'm',
      patchSelected: () => order.push('patch'),
      commitEdit: () => order.push('commit'),
    });
    const { result } = renderHook(() => useSelectedComponent());
    await result.current.onChange({ motorMount: false });
    expect(order).toEqual(['patch', 'commit']);
  });
});
