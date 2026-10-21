// @vitest-environment jsdom
// cspell:ignore Metalle Kunststoffe
import { StrictMode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useWorkspaceStore } from '../../../src/state/store';
import { MaterialPicker } from '../../../src/components/design/MaterialPicker';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { setMaterialStore, type MaterialStore } from '../../../src/services/materials/materialStore';
import { removeCustom } from '../../../src/services/materials/materials';
import { serveData } from '../../testing/serveData';
import type { Material } from '../../../src/services/materials/materialTypes';
import { DefaultMaterials } from '../../../src/components/layout/DefaultMaterials';
import { defaultMaterialKey } from '../../../src/services/design/materialSlots';
import catalog from '../../../public/data/materials.generated.json';

/**
 * The picker's two store round-trips finish after an await and are guarded by
 * `useLatest().observe()`. `main.tsx` renders the app under React.StrictMode,
 * whose development double-invoke runs every effect's cleanup once and then
 * re-runs the effect, so a guard that only ever flips to stale on cleanup would
 * stay stale for the component's whole life, and the post-await state would
 * never land.
 */

// A material kept in the design lives on the shared workspace tree; clear it so
// one test's addition does not show in the next test's list.
beforeEach(() => useWorkspaceStore.setState((s) => ({ tree: { ...s.tree, documentMaterials: undefined } })));

/** An in-memory material store, so the test never touches IndexedDB. */
function memoryStore(): MaterialStore {
  let items: Material[] = [];
  return {
    list: async () => items,
    add: async (m) => {
      items = [{ ...m, custom: true }, ...items.filter((x) => !(x.name === m.name && x.type === m.type))];
    },
    remove: async (name, type) => {
      items = items.filter((x) => !(x.name === name && x.type === type));
    },
  };
}

describe('MaterialPicker under StrictMode', () => {
  beforeAll(serveData);
  beforeEach(() => setMaterialStore(memoryStore()));

  it('still applies a custom material added after the store round-trip', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <StrictMode>
        <MaterialPicker onChange={onChange} />
      </StrictMode>,
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '__add__' } });

    fireEvent.change(screen.getByPlaceholderText('Name (e.g. G10 fiberglass)'), { target: { value: 'Moon Cheese' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1234' } });
    // The custom-list path, the one with the store round trip.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Add to my custom materials, for every design' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // The `submitCustom` path: two awaits, then setMats + onChange. The
    // density is typed in the user's unit (g/cm³ by default) and handed on in
    // SI, so only the name is pinned here; the third argument is the group the
    // material was filed under, which the .ork writer wants.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('Moon Cheese', expect.any(Number), expect.any(String)));
    expect(onChange.mock.calls[0]![1]).toBeGreaterThan(0);
    expect(screen.getByRole('option', { name: /Moon Cheese/ })).toBeTruthy();
  });
});

/**
 * Deleting a custom material takes it out of the list and nothing else. Desktop's
 * material database delete (`MaterialEditPanel.removeMaterial` in 24.12)
 * removes the entry and leaves every component that uses it alone, so the part
 * keeps the name and density it was given, and a picker already on screen shows
 * them under "From this part" once Custom Materials has deleted it.
 */
describe('MaterialPicker after a custom material is deleted', () => {
  beforeAll(serveData);

  /** A store holding `items`, whose delete takes the named entry out. */
  const storeOf = (items: Material[]) => {
    setMaterialStore({
      list: async () => items,
      add: async () => {},
      remove: async (name, type) => {
        items = items.filter((x) => !(x.name === name && x.type === type));
      },
    });
  };

  const selectOf = () =>
    [...document.querySelectorAll('select')].find((s) => s.querySelector('optgroup')) as HTMLSelectElement;

  /** Delete through the library, as Custom Materials does, and wait for the open picker to reload. */
  const deleteIt = async (name: string, type: Material['type']) => {
    await waitFor(() => expect(screen.queryAllByRole('option', { name: /★/ }).length).toBeGreaterThan(0));
    await act(async () => {
      await removeCustom(name, type);
    });
    await waitFor(() => expect(screen.queryAllByRole('option', { name: /★/ })).toHaveLength(0));
  };

  // Every material type, since each one has its own catalog and its own slot on
  // the part.
  it.each(['bulk', 'surface', 'line'] as const)(
    'keeps a %s part on the deleted material, shown as the part’s own',
    async (type) => {
      storeOf([{ name: 'Moon Cheese', density: 1.234, type, group: 'Other', custom: true }]);
      const onChange = vi.fn();
      renderWithProviders(<MaterialPicker type={type} value="Moon Cheese" density={1.234} onChange={onChange} />);
      await deleteIt('Moon Cheese', type);
      expect(onChange).not.toHaveBeenCalled();
      const select = selectOf();
      expect(select.value).toBe('Moon Cheese');
      const own = select.querySelector('optgroup[label="From this part"] option');
      expect(own?.textContent).toMatch(/^Moon Cheese · /);
      // No list entry of that name remains: the material left the list.
      expect(
        [...select.querySelectorAll('optgroup:not([label="From this part"]) option')].map(
          (o) => (o as HTMLOptionElement).value,
        ),
      ).not.toContain('Moon Cheese');
    },
  );

  it('keeps the part’s own density when the deleted entry shadowed a built-in of the same name', async () => {
    // The built-in Balsa is in the served catalog at its own density; the custom
    // entry of the same name is the part's, at another.
    const builtIn = (catalog as Material[]).find((m) => m.type === 'bulk' && m.name === 'Balsa')!;
    expect(builtIn).toBeTruthy();
    const own = builtIn.density * 2;
    storeOf([{ name: 'Balsa', density: own, type: 'bulk', group: 'Custom', custom: true }]);
    const onChange = vi.fn();
    renderWithProviders(<MaterialPicker value="Balsa" density={own} onChange={onChange} />);
    await deleteIt('Balsa', 'bulk');
    expect(onChange).not.toHaveBeenCalled();
    const select = selectOf();
    // The part's own entry, ahead of the built-in of the same name.
    expect(select.querySelector('optgroup[label="From this part"] option')?.textContent).toMatch(/^Balsa · /);
    expect(select.value).toBe('Balsa');
  });

  it('leaves a Settings default on the deleted material', async () => {
    storeOf([{ name: 'Moon Cheese', density: 1234, type: 'bulk', group: 'Other', custom: true }]);
    const onChange = vi.fn();
    renderWithProviders(
      <DefaultMaterials
        defaults={{ [defaultMaterialKey('nosecone', 'bulk')]: { name: 'Moon Cheese', density: 1234 } }}
        onChange={onChange}
      />,
    );
    await deleteIt('Moon Cheese', 'bulk');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('offers no delete of its own: Custom Materials is where materials are managed', async () => {
    storeOf([{ name: 'Moon Cheese', density: 1234, type: 'bulk', group: 'Other', custom: true }]);
    renderWithProviders(<MaterialPicker value="Moon Cheese" density={1234} onChange={() => {}} />);
    await waitFor(() => expect(selectOf().value).toBe('Moon Cheese'));
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
    expect(screen.getByRole('option', { name: 'Manage custom materials…' })).toBeTruthy();
  });
});

describe('MaterialPicker naming', () => {
  beforeAll(serveData);
  beforeEach(() => setMaterialStore(memoryStore()));

  it('names the select for a screen reader, by the row label or the default title', () => {
    renderWithProviders(<MaterialPicker onChange={() => {}} label="Fillet material" />);
    expect(screen.getByRole('combobox', { name: 'Fillet material' })).toBeTruthy();
  });

  it('falls back to Material when the row has no label', () => {
    renderWithProviders(<MaterialPicker onChange={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Material' })).toBeTruthy();
  });
});

/**
 * Group headings in the reader's language, as desktop translates its material
 * groups. The value stored with a material stays the catalog's English name.
 */
describe('MaterialPicker group headings', () => {
  beforeAll(serveData);
  beforeEach(() => setMaterialStore(memoryStore()));

  it('names the groups in the UI language', async () => {
    const i18n = (await import('../../../src/i18n')).default;
    await i18n.changeLanguage('de');
    try {
      const { container } = renderWithProviders(<MaterialPicker onChange={() => {}} />);
      await waitFor(() => expect(container.querySelectorAll('optgroup').length).toBeGreaterThan(1));
      const labels = [...container.querySelectorAll('optgroup')].map((g) => g.getAttribute('label'));
      expect(labels).toContain('Metalle');
      expect(labels).toContain('Kunststoffe');
      expect(labels).not.toContain('Metals');
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});

/**
 * The add form's density box names its material type's quantity and the unit
 * the box reads, once. The quantity names are desktop's own for the three kinds
 * (`pref.dlg.lbl.Bulkdensity`, `Surfacedensity`, `Linedensity` in 24.12's
 * l10n/messages.properties:388-392); the unit is the one the list beside the box
 * prints each entry's density in, which is the unit the typed figure is read in.
 */
describe('MaterialPicker add form density box', () => {
  beforeAll(serveData);
  beforeEach(() => setMaterialStore(memoryStore()));

  it.each([
    ['bulk', 'Bulk density'],
    ['surface', 'Surface density'],
    ['line', 'Line density'],
  ] as const)('names a %s material’s box by its quantity and its own unit', async (type, quantity) => {
    const { container } = renderWithProviders(<MaterialPicker type={type} onChange={() => {}} />);
    const select = [...container.querySelectorAll('select')].at(-1) as HTMLSelectElement;
    await waitFor(() => expect(select.querySelectorAll('optgroup option').length).toBeGreaterThan(0));
    // "Name · 170 kg/m³": the list's unit is what follows the number.
    const listed = (select.querySelector('optgroup option')!.textContent ?? '').split(' · ')[1]!;
    const unit = listed.slice(listed.indexOf(' ') + 1);
    fireEvent.change(select, { target: { value: '__add__' } });
    const box = screen.getByRole('spinbutton');
    expect(box.getAttribute('aria-label')).toBe(`${quantity} (${unit})`);
    expect(box.getAttribute('placeholder')).toBe(`${quantity} (${unit})`);
  });
});

/**
 * A fin fillet is offered every bulk material, adhesives included, as desktop's
 * fin fillet material box is: FinSetConfig.java:632 in 24.12 builds its
 * `MaterialModel` over `Material.Type.BULK`, the whole bulk database. The
 * expected list is the served catalog file itself.
 */
describe('MaterialPicker on a fillet', () => {
  beforeAll(serveData);
  beforeEach(() => setMaterialStore(memoryStore()));

  it('offers every bulk material in the catalog', async () => {
    const { container } = renderWithProviders(<MaterialPicker use="fillet" onChange={() => {}} />);
    const bulk = (catalog as Material[]).filter((m) => m.type === 'bulk').map((m) => m.name);
    const select = container.querySelector('select') as HTMLSelectElement;
    await waitFor(() => expect(select.querySelectorAll('optgroup option').length).toBe(bulk.length));
    const offered = [...select.querySelectorAll('optgroup option')].map((o) => o.getAttribute('value'));
    expect(offered.sort()).toEqual([...bulk].sort());
  });
});
