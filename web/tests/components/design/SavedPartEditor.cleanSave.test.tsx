// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type { CustomPart } from '../../../src/services/parts/presetStore';
import { setPresetStore } from '../../../src/services/parts/presetStore';
import { SavedPartEditor } from '../../../src/components/design/SavedPartEditor';
import { renderWithProviders } from '../../testing/renderWithProviders';

/**
 * A save stores the labels cleaned (trimmed, a blank maker made the default),
 * and the list hands the editor the stored part back. The editor has to read
 * as clean afterward, or the user is told a saved edit is unsaved.
 */
describe('a saved part after its save', () => {
  it('is not dirty when the store cleaned what was typed', async () => {
    const part = {
      id: 'p1',
      type: 'bodytube',
      mfr: 'Bench',
      partNo: 'BT-1',
      desc: '',
      node: { length: 0.3, outerRadius: 0.025, thickness: 0.001 },
    } as unknown as CustomPart;
    let stored: CustomPart[] = [part];
    setPresetStore({
      list: async () => stored,
      add: async (p) => {
        stored = [p, ...stored.filter((x) => x.id !== p.id)];
      },
      remove: async () => {},
    });
    const dirty = vi.fn();
    // The list's part, which it replaces with the stored one on the store's change signal.
    let showStored = () => {};
    function List() {
      const [shown, setShown] = useState(part);
      showStored = () => setShown(stored[0]!);
      return <SavedPartEditor part={shown} onDirtyChange={dirty} onDelete={() => {}} onBack={() => {}} />;
    }
    renderWithProviders(<List />);
    const partNo = screen.getByRole('textbox', { name: /Part name/ });
    fireEvent.change(partNo, { target: { value: 'BT-2 ' } });
    expect(dirty).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(stored[0]!.partNo).toBe('BT-2'));
    act(() => showStored());
    await waitFor(() => expect(dirty).toHaveBeenLastCalledWith(false));
  });
});
