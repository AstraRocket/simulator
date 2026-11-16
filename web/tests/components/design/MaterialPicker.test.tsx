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

// StrictMode's effect double-invoke can leave a cleanup-only `useLatest().observe()` guard stale forever.
beforeEach(() => useWorkspaceStore.setState((s) => ({ tree: { ...s.tree, documentMaterials: undefined } })));

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
    fireEvent.change(screen.getByRole('spinbutton', { name: /density/i }), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Add to my custom materials, for every design' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // Density is converted from the user's unit to SI, so only the name is pinned.
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith('Moon Cheese', expect.any(Number), expect.any(String), undefined),
    );
    expect(onChange.mock.calls[0]![1]).toBeGreaterThan(0);
    expect(screen.getByRole('option', { name: /Moon Cheese/ })).toBeTruthy();
  });
});

describe('MaterialPicker after a custom material is deleted', () => {
  beforeAll(serveData);

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

  const deleteIt = async (name: string, type: Material['type']) => {
    await waitFor(() => expect(screen.queryAllByRole('option', { name: /★/ }).length).toBeGreaterThan(0));
    await act(async () => {
      await removeCustom(name, type);
    });
    await waitFor(() => expect(screen.queryAllByRole('option', { name: /★/ })).toHaveLength(0));
  };

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
      expect(
        [...select.querySelectorAll('optgroup:not([label="From this part"]) option')].map(
          (o) => (o as HTMLOptionElement).value,
        ),
      ).not.toContain('Moon Cheese');
    },
  );

  it('keeps the part’s own density when the deleted entry shadowed a built-in of the same name', async () => {
    const builtIn = (catalog as Material[]).find((m) => m.type === 'bulk' && m.name === 'Balsa')!;
    expect(builtIn).toBeTruthy();
    const own = builtIn.density * 2;
    storeOf([{ name: 'Balsa', density: own, type: 'bulk', group: 'Custom', custom: true }]);
    const onChange = vi.fn();
    renderWithProviders(<MaterialPicker value="Balsa" density={own} onChange={onChange} />);
    await deleteIt('Balsa', 'bulk');
    expect(onChange).not.toHaveBeenCalled();
    const select = selectOf();
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
    const listed = (select.querySelector('optgroup option')!.textContent ?? '').split(' · ')[1]!;
    const unit = listed.slice(listed.indexOf(' ') + 1);
    fireEvent.change(select, { target: { value: '__add__' } });
    const box = screen.getAllByRole('spinbutton')[0]!;
    expect(box.getAttribute('aria-label')).toBe(`${quantity} (${unit})`);
    expect(box.getAttribute('placeholder')).toBe(`${quantity} (${unit})`);
  });
});

// Every bulk material, adhesives included (FinSetConfig.java:632).
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
