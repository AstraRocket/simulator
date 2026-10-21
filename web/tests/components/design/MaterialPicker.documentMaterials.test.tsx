// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MaterialPicker } from '../../../src/components/design/MaterialPicker';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { setMaterialStore } from '../../../src/services/materials/materialStore';
import type { Material } from '../../../src/services/materials/materialTypes';
import type { DocumentMaterial } from '../../../src/services/materials/documentMaterials';
import { useWorkspaceStore } from '../../../src/state/store';
import { serveData } from '../../testing/serveData';

/**
 * The design's own materials in the picker. Desktop's material box
 * (`swing.gui.adaptors.MaterialModel` in 24.12) lists the application database
 * and then `DocumentPreferences.getDatabase(type)`, the document's own; and its
 * "Define custom material" opens `CustomMaterialDialog` with "Add material to
 * application database" unchecked, so a material defined on a part is a
 * document material unless the user ticks it.
 */

let library: Material[] = [];

const setDesignMaterials = (list: DocumentMaterial[] | undefined) =>
  useWorkspaceStore.setState((s) => ({ tree: { ...s.tree, documentMaterials: list } }));

const designMaterials = () => useWorkspaceStore.getState().tree.documentMaterials;

const materialSelect = () =>
  [...document.querySelectorAll('select')].find((s) =>
    s.querySelector('option[value="__default__"]'),
  ) as HTMLSelectElement;

/** The labels of the "In this design" group, or [] when there is none. */
const designGroup = () =>
  [...materialSelect().querySelectorAll('optgroup')]
    .filter((g) => g.label === 'In this design')
    .flatMap((g) => [...g.querySelectorAll('option')].map((o) => o.textContent));

beforeAll(serveData);
beforeEach(() => {
  library = [];
  setMaterialStore({
    list: async () => library,
    add: async (m) => {
      library = [{ ...m, custom: true }, ...library];
    },
    remove: async () => {},
  });
  setDesignMaterials(undefined);
});

const loaded = () =>
  waitFor(() => expect(materialSelect().querySelectorAll('optgroup option').length).toBeGreaterThan(5));

describe('the design materials in the list', () => {
  it('offers them in their own group and applies one with its density and group', async () => {
    setDesignMaterials([
      { name: 'Birch ply', type: 'bulk', density: 700, group: 'Woods' },
      { name: 'Birch ply', type: 'bulk', density: 650, group: 'Woods' },
      { name: 'Silk', type: 'surface', density: 0.04, group: 'Fabrics' },
    ]);
    const onChange = vi.fn();
    renderWithProviders(<MaterialPicker onChange={onChange} />);
    await loaded();
    // Bulk only, by name then density as desktop's database orders them.
    expect(designGroup()).toEqual([
      expect.stringMatching(/^Birch ply · 0\.650 /),
      expect.stringMatching(/^Birch ply · 0\.700 /),
    ]);
    const option = [...materialSelect().querySelectorAll('option')].find((o) =>
      o.textContent?.startsWith('Birch ply · 0.700'),
    )!;
    fireEvent.change(materialSelect(), { target: { value: option.value } });
    expect(onChange).toHaveBeenCalledWith('Birch ply', 700, 'Woods');
  });

  it('does not repeat a design material the catalog holds at the same density', async () => {
    // Desktop writes the stock materials a file's parts use into the list
    // (the bundled examples carry Cardboard at 680 under Custom).
    setDesignMaterials([
      { name: 'Cardboard', type: 'bulk', density: 680, group: 'Custom' },
      { name: 'Cardboard', type: 'bulk', density: 900, group: 'Custom' },
    ]);
    renderWithProviders(<MaterialPicker onChange={() => {}} />);
    await loaded();
    expect(designGroup()).toEqual([expect.stringMatching(/^Cardboard · 0\.900 /)]);
  });

  it('shows the part’s design material as chosen, not as a material of its own', async () => {
    setDesignMaterials([{ name: 'Birch ply', type: 'bulk', density: 650, group: 'Woods' }]);
    renderWithProviders(<MaterialPicker value="Birch ply" density={650} onChange={() => {}} />);
    await loaded();
    const chosen = materialSelect().selectedOptions[0]!;
    expect(chosen.parentElement?.getAttribute('label')).toBe('In this design');
    expect(screen.queryByText('From this part')).toBeNull();
  });

  it('is not offered in Settings, which picks for no design', async () => {
    setDesignMaterials([{ name: 'Birch ply', type: 'bulk', density: 650, group: 'Woods' }]);
    renderWithProviders(<MaterialPicker design={false} onChange={() => {}} />);
    await loaded();
    expect(designGroup()).toEqual([]);
  });
});

describe('a new custom material', () => {
  const fillForm = (name: string) => {
    fireEvent.change(materialSelect(), { target: { value: '__add__' } });
    fireEvent.change(screen.getByPlaceholderText('Name (e.g. G10 fiberglass)'), { target: { value: name } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0.5' } });
  };

  it('is kept in the design by default, and not added to the custom list', async () => {
    const onChange = vi.fn();
    renderWithProviders(<MaterialPicker onChange={onChange} />);
    await loaded();
    fillForm('Mine');
    expect((screen.getByRole('checkbox', { name: /Add to my custom materials/ }) as HTMLInputElement).checked).toBe(
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('Mine', 500, 'Other'));
    expect(designMaterials()).toEqual([{ name: 'Mine', type: 'bulk', density: 500, group: 'Other' }]);
    expect(library).toEqual([]);
  });

  it('goes to the custom list, and not the design, when the box is ticked', async () => {
    const onChange = vi.fn();
    renderWithProviders(<MaterialPicker onChange={onChange} />);
    await loaded();
    fillForm('Mine');
    fireEvent.click(screen.getByRole('checkbox', { name: /Add to my custom materials/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('Mine', 500, 'Other'));
    expect(library.map((m) => m.name)).toEqual(['Mine']);
    expect(designMaterials()).toBeUndefined();
  });

  it('has no box in Settings, where it always goes to the custom list', async () => {
    renderWithProviders(<MaterialPicker design={false} onChange={() => {}} />);
    await loaded();
    fillForm('Mine');
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(library.map((m) => m.name)).toEqual(['Mine']));
    expect(designMaterials()).toBeUndefined();
  });

  it('is refused with a blank name, as the custom list refuses one', async () => {
    const onChange = vi.fn();
    renderWithProviders(<MaterialPicker onChange={onChange} />);
    await loaded();
    fillForm('   ');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('A material name is required.')).toBeTruthy());
    expect(onChange).not.toHaveBeenCalled();
    expect(designMaterials()).toBeUndefined();
  });
});

describe('the design material list in the workspace', () => {
  it('takes an addition as one undo step, and a repeat of an entry as none', () => {
    const m: DocumentMaterial = { name: 'Birch ply', type: 'bulk', density: 650, group: 'Woods' };
    const steps = () => useWorkspaceStore.getState().past.length;
    const before = steps();
    useWorkspaceStore.getState().addDocumentMaterial(m);
    expect(designMaterials()).toEqual([m]);
    expect(steps()).toBe(before + 1);
    // Desktop's Database.add keeps one entry per name and density.
    useWorkspaceStore.getState().addDocumentMaterial({ ...m });
    expect(steps()).toBe(before + 1);
    useWorkspaceStore.getState().undo();
    expect(designMaterials()).toBeUndefined();
  });
});
