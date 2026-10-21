// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MyMaterialsDialog } from '../../../src/components/design/MyMaterialsDialog';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { setMaterialStore } from '../../../src/services/materials/materialStore';
import type { Material } from '../../../src/services/materials/materialTypes';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';
import { useWorkspaceStore } from '../../../src/state/store';
import { useConfirmStore } from '../../../src/state/confirmStore';
import { serveData } from '../../testing/serveData';

/**
 * Custom Materials: desktop's Preferences ▸ Custom materials table
 * (`MaterialEditPanel` in 24.12) as a list beside an editor. The rules behind
 * each action are pinned in tests/services/materials/myMaterials.test.ts; this
 * holds the dialog to them.
 */

let library: Material[] = [];

const tube: ComponentNode = {
  type: 'bodytube',
  id: 'tube',
  name: 'Main tube',
  materialName: 'Birch ply',
  density: 650,
};

beforeAll(serveData);
beforeEach(() => {
  library = [{ name: 'Moon Cheese', type: 'bulk', density: 1234, group: 'Other', custom: true }];
  setMaterialStore({
    list: async () => library,
    add: async (m) => {
      library = [{ ...m, custom: true }, ...library.filter((x) => !(x.name === m.name && x.type === m.type))];
    },
    remove: async (name, type) => {
      library = library.filter((x) => !(x.name === name && x.type === type));
    },
  });
  useWorkspaceStore.setState((s) => ({
    tree: {
      ...s.tree,
      components: [{ type: 'stage', id: 'stage', children: [tube] }],
      documentMaterials: [{ name: 'Birch ply', type: 'bulk', density: 650, group: 'Woods' }],
    },
  }));
});

const dialog = () => screen.getByRole('dialog', { name: 'Custom Materials' });

describe('Custom Materials', () => {
  it('lists the design’s materials and the browser’s, each under its own heading', async () => {
    renderWithProviders(<MyMaterialsDialog onClose={() => {}} />);
    await waitFor(() => expect(within(dialog()).getByText('Moon Cheese')).toBeTruthy());
    expect(within(dialog()).getByText('In this design')).toBeTruthy();
    expect(within(dialog()).getByText('In this browser, for every design')).toBeTruthy();
    expect(within(dialog()).getByText('Birch ply')).toBeTruthy();
  });

  it('names the parts made of the selected material', async () => {
    renderWithProviders(<MyMaterialsDialog onClose={() => {}} />);
    fireEvent.click(await within(dialog()).findByRole('button', { name: /Birch ply/ }));
    expect(within(dialog()).getByText('Used by: Main tube')).toBeTruthy();
  });

  it('refuses to delete a design material a part is made of, and says which', async () => {
    renderWithProviders(<MyMaterialsDialog onClose={() => {}} />);
    fireEvent.click(await within(dialog()).findByRole('button', { name: /Birch ply/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(
        within(dialog()).getByText('Birch ply cannot be deleted while parts are made of it: Main tube.'),
      ).toBeTruthy(),
    );
    expect(useWorkspaceStore.getState().tree.documentMaterials).toHaveLength(1);
  });

  it('adds a new material to the browser list by default, as desktop’s manager does', async () => {
    renderWithProviders(<MyMaterialsDialog onClose={() => {}} />);
    fireEvent.click(await within(dialog()).findByRole('button', { name: 'New material' }));
    expect((within(dialog()).getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    fireEvent.change(within(dialog()).getByLabelText('Name'), { target: { value: 'G10' } });
    fireEvent.change(within(dialog()).getByRole('spinbutton'), { target: { value: '1.8' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(library.map((m) => m.name)).toContain('G10'));
    expect(library.find((m) => m.name === 'G10')?.density).toBeCloseTo(1800);
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: /G10/ })).toBeTruthy());
  });

  it('moves the parts with an edit of a design material, as one undo step', async () => {
    renderWithProviders(<MyMaterialsDialog onClose={() => {}} />);
    fireEvent.click(await within(dialog()).findByRole('button', { name: /Birch ply/ }));
    fireEvent.change(within(dialog()).getByLabelText('Name'), { target: { value: 'Ply B' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    const part = () => (useWorkspaceStore.getState().tree.components[0]!.children as ComponentNode[])[0]!;
    await waitFor(() => expect(part().materialName).toBe('Ply B'));
    expect(part().density).toBe(650);
    act(() => useWorkspaceStore.getState().undo());
    expect(part().materialName).toBe('Birch ply');
  });

  it('asks before deleting a browser material, and deletes it', async () => {
    renderWithProviders(<MyMaterialsDialog onClose={() => {}} />);
    fireEvent.click(await within(dialog()).findByRole('button', { name: /Moon Cheese/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(useConfirmStore.getState().request?.message).toBe('Delete the material Moon Cheese?'));
    act(() => useConfirmStore.getState().settle(true));
    await waitFor(() => expect(library).toEqual([]));
  });
});
