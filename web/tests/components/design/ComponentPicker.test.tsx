// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, waitFor, within } from '@testing-library/react';
import { ComponentPicker } from '../../../src/components/design/ComponentPicker';
import type { CurrentPart } from '../../../src/components/design/PickerTable';
import { renderWithProviders, seedSettings } from '../../testing/renderWithProviders';
import { serveData } from '../../testing/serveData';
import type { PickerType } from '../../../src/services/parts/componentDb';
import type { FitContext } from '../../../src/services/parts/componentFilter';

const PM_TUBE = { od: 0.0546608, bore: 0.0515112 };

const open = async (type: PickerType, fit?: FitContext, current?: CurrentPart) => {
  const onApply = vi.fn();
  const { container, unmount } = renderWithProviders(
    <ComponentPicker type={type} fit={fit} current={current} onApply={onApply} />,
  );
  const button = await waitFor(() => {
    const b = within(container).getByRole('button') as HTMLButtonElement;
    expect(b.disabled).toBe(false);
    return b;
  });
  fireEvent.click(button);
  const dialog = await waitFor(() => within(container).getByRole('dialog'));
  return { dialog, onApply, unmount };
};

const rows = (dialog: HTMLElement): string[][] =>
  [...dialog.querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => td.textContent ?? ''),
  );
const headers = (dialog: HTMLElement): string[] =>
  [...dialog.querySelectorAll('thead th')].map((th) => th.textContent?.replace(/[▲▼]/g, '').trim() ?? '');
const footer = (dialog: HTMLElement): string => dialog.lastElementChild?.textContent ?? '';

// Scoped: an accessible-name query over the 200-row table is slow enough to time out on CI.
const head = (dialog: HTMLElement, name: string): HTMLElement =>
  within(dialog.querySelector('thead')!).getByRole('button', { name: new RegExp(`^${name}`) });

const search = (dialog: HTMLElement): HTMLElement => within(dialog).getByLabelText(/Search parts/);
const clearFilters = (dialog: HTMLElement): HTMLElement =>
  within(search(dialog).parentElement!).getByRole('button', { name: 'Clear filters' });

describe('ComponentPicker', () => {
  beforeAll(serveData);
  beforeEach(() => seedSettings({ units: { length: 'mm' } }));
  afterEach(() => vi.clearAllMocks());

  it('names every dimension it shows, and the unit once in the heading', async () => {
    const { dialog } = await open('bodytube');
    expect(headers(dialog)).toEqual(['Mfr.', 'Part no.', 'OD (mm)', 'ID (mm)', 'Length (mm)', 'Material', 'Notes']);
  });

  it('gives each type the columns that identify it', async () => {
    const ring = await open('centeringring');
    expect(headers(ring.dialog)).toContain('Thickness (mm)');
    expect(headers(ring.dialog)).toContain('ID (mm)');
    ring.unmount();

    const chute = await open('parachute');
    expect(headers(chute.dialog)).toEqual(['Mfr.', 'Part no.', 'Diameter (mm)', 'Drag coeff', 'Notes']);
    expect(headers(chute.dialog)).not.toContain('Length (mm)');
  });

  it('translates the nose cone shape instead of printing the raw enum', async () => {
    const { dialog } = await open('nosecone');
    const shapes = new Set(rows(dialog).map((r) => r[2]));
    expect(shapes.size).toBeGreaterThan(0);
    for (const s of shapes) expect(s).not.toMatch(/^(ogive|haack|ellipsoid|conical|parabolic)$/);
    expect([...shapes].some((s) => s === 'Ogive' || s === 'Ellipsoid' || s === 'Haack')).toBe(true);
  });

  describe('without a fit context', () => {
    it('offers no fit column and no fit toggle, rather than a control that cannot answer', async () => {
      const { dialog } = await open('tubecoupler');
      expect(headers(dialog)).not.toContain('Fit (mm)');
      expect(within(dialog).queryByLabelText('Fits here')).toBeNull();
      expect(within(dialog).queryByText('Fits here')).toBeNull();
    });

    it('reports the true match count and says when it is holding rows back', async () => {
      const { dialog } = await open('bodytube');
      expect(rows(dialog).length).toBe(200);
      expect(footer(dialog)).toMatch(/Showing 200 of 1[,. ]?089/);
    });

    it('lists the legacy parts only once they are asked for', async () => {
      const { dialog } = await open('bodytube');
      const toggle = within(dialog).getByLabelText('Show legacy') as HTMLInputElement;
      expect(toggle.checked).toBe(false);
      fireEvent.click(toggle);
      expect(footer(dialog)).toMatch(/Showing 200 of 1[,. ]?496/);
    });
  });

  describe('with a fit context', () => {
    const insideTube: FitContext = { parentInner: PM_TUBE.bore };

    it('ranks the fitting parts first WITHOUT hiding the rest', async () => {
      const { dialog } = await open('tubecoupler', insideTube);
      expect(rows(dialog).length).toBe(200);
      expect(footer(dialog)).toMatch(/Showing 200 of 237/);
      const fits = rows(dialog)
        .map((r) => r[0])
        .filter((f) => f !== '')
        .map(Number);
      expect(fits.length).toBeGreaterThan(0);
      expect(fits).toEqual([...fits].sort((a, b) => a - b));
      for (const r of rows(dialog).filter((r) => r[0] !== '')) {
        const od = Number(r[3]); // Fit, Mfr, Part no, OD
        expect(od).toBeGreaterThan(49);
        expect(od).toBeLessThanOrEqual(51.6);
      }
    });

    it('hides the rest only when asked', async () => {
      const { dialog } = await open('tubecoupler', insideTube);
      fireEvent.click(within(dialog).getByLabelText('Fits here'));
      const n = rows(dialog).length;
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(12);
      expect(footer(dialog)).toMatch(new RegExp(`${n} parts?`));
      for (const r of rows(dialog)) expect(r[0]).not.toBe('');
    });

    it('leaves the fit column blank for a part that is not in the running', async () => {
      const { dialog } = await open('tubecoupler', insideTube);
      const fits = rows(dialog).map((r) => r[0]);
      expect(fits.some((f) => f !== '')).toBe(true);
      expect(fits.at(-1)).toBe('');
    });

    it('ranks a transition by both ends, as desktop matches them', async () => {
      const { dialog } = await open('transition', { foreMatch: 0.0248, aftMatch: 0.0416 });
      expect(headers(dialog)[0]).toBe('Fit (mm)');
      fireEvent.click(within(dialog).getByLabelText('Fits here'));
      // Columns: Fit, Mfr, Part no, Shape, Fore, Aft.
      const shown = rows(dialog);
      expect(shown.length).toBeGreaterThan(0);
      for (const r of shown) {
        expect(Math.abs(Number(r[4]) - 24.8)).toBeLessThan(1.24);
        expect(Math.abs(Number(r[5]) - 41.6)).toBeLessThan(2.08);
      }
    });

    it('abstains for a parachute, whose fit is packed volume the model lacks', async () => {
      const { dialog } = await open('parachute', insideTube);
      expect(headers(dialog)).not.toContain('Fit (mm)');
      expect(within(dialog).queryByLabelText('Fits here')).toBeNull();
    });
  });

  describe('filters', () => {
    it('narrows by manufacturer', async () => {
      const { dialog } = await open('bodytube');
      const select = within(dialog).getByLabelText('Mfr.') as HTMLSelectElement;
      expect([...select.options][0]!.textContent).toBe('All manufacturers');
      fireEvent.change(select, { target: { value: 'Estes' } });
      const mfrs = new Set(rows(dialog).map((r) => r[0]));
      expect(mfrs).toEqual(new Set(['Estes']));
    });

    it('narrows by outer diameter, in the unit on screen', async () => {
      const { dialog } = await open('bodytube');
      fireEvent.change(within(dialog).getByLabelText('min'), { target: { value: '50' } });
      fireEvent.change(within(dialog).getByLabelText('max'), { target: { value: '60' } });
      const ods = rows(dialog).map((r) => Number(r[2]));
      expect(ods.length).toBeGreaterThan(0);
      for (const od of ods) {
        expect(od).toBeGreaterThanOrEqual(50);
        expect(od).toBeLessThanOrEqual(60);
      }
    });

    it('ANDs the search terms across manufacturer, part number and description', async () => {
      const { dialog } = await open('bodytube');
      fireEvent.change(within(dialog).getByLabelText(/Search parts/), { target: { value: 'blue tube mmt' } });
      const shown = rows(dialog);
      expect(shown.length).toBeGreaterThan(0);
      for (const r of shown) expect(r[6]).toContain('MMT');
    });

    it('narrows by material family', async () => {
      const { dialog } = await open('bodytube');
      const select = within(dialog).getByLabelText('Material') as HTMLSelectElement;
      expect([...select.options][0]!.textContent).toBe('All materials');
      const families = [...select.options].slice(1).map((o) => o.value);
      expect(families).toContain('Fiberglass');
      expect(families.length).toBeLessThan(10);
      fireEvent.change(select, { target: { value: 'Fiberglass' } });
      for (const r of rows(dialog)) expect(r[5]).toContain('Fiberglass');
    });

    it('narrows nose cones by shape, with translated labels', async () => {
      const { dialog } = await open('nosecone');
      const select = within(dialog).getByLabelText('Shape') as HTMLSelectElement;
      expect([...select.options][0]!.textContent).toBe('All shapes');
      const ogive = [...select.options].find((o) => o.value === 'ogive')!;
      expect(ogive.textContent).toBe('Ogive');
      fireEvent.change(select, { target: { value: 'ogive' } });
      for (const r of rows(dialog)) expect(r[2]).toBe('Ogive');
    });

    it('offers neither control where the type has nothing to offer', async () => {
      const chute = await open('parachute');
      expect(within(chute.dialog).queryByLabelText('Material')).toBeNull();
      expect(within(chute.dialog).queryByLabelText('Shape')).toBeNull();
      chute.unmount();
      const tube = await open('bodytube');
      expect(within(tube.dialog).queryByLabelText('Material')).not.toBeNull();
      expect(within(tube.dialog).queryByLabelText('Shape')).toBeNull();
    });

    it('offers a way out of a filter set that matches nothing', async () => {
      const { dialog } = await open('bodytube');
      fireEvent.change(within(dialog).getByLabelText(/Search parts/), { target: { value: '~~~' } });
      expect(rows(dialog).length).toBe(1);
      expect(rows(dialog)[0]![0]).toContain('No matching parts');
      fireEvent.click(clearFilters(dialog));
      expect(rows(dialog).length).toBe(200);
    });

    it('clears the material and shape facets too', async () => {
      const { dialog } = await open('nosecone');
      fireEvent.change(within(dialog).getByLabelText('Material'), { target: { value: 'Balsa' } });
      fireEvent.change(within(dialog).getByLabelText('Shape'), { target: { value: 'conical' } });
      const narrowed = rows(dialog).length;
      fireEvent.click(clearFilters(dialog));
      expect(rows(dialog).length).toBeGreaterThan(narrowed);
      expect((within(dialog).getByLabelText('Material') as HTMLSelectElement).value).toBe('');
      expect((within(dialog).getByLabelText('Shape') as HTMLSelectElement).value).toBe('');
    });

    it('names the fit filter when IT is what emptied the list', async () => {
      const { dialog } = await open('tubecoupler', { parentInner: 0.4 });
      fireEvent.click(within(dialog).getByLabelText('Fits here'));
      expect(rows(dialog)[0]![0]).toContain('Only parts that fit');
    });
  });

  describe('sorting', () => {
    it('sorts by a column, and flips when the same heading is clicked again', async () => {
      const { dialog } = await open('bodytube');

      fireEvent.click(head(dialog, 'OD'));
      const up = rows(dialog).map((r) => Number(r[2]));
      expect(up).toEqual([...up].sort((a, b) => a - b));

      fireEvent.click(head(dialog, 'OD'));
      const down = rows(dialog).map((r) => Number(r[2]));
      expect(down).toEqual([...down].sort((a, b) => b - a));
    });

    it('tells assistive tech which column is sorted, and which way', async () => {
      const { dialog } = await open('bodytube');
      fireEvent.click(head(dialog, 'Length'));
      const th = [...dialog.querySelectorAll('thead th')];
      const sorted = th.filter((h) => h.hasAttribute('aria-sort') && h.getAttribute('aria-sort') !== 'none');
      expect(sorted.length).toBe(1);
      expect(sorted[0]!.textContent).toContain('Length');
      expect(sorted[0]!.getAttribute('aria-sort')).toBe('ascending');
      fireEvent.click(head(dialog, 'Length'));
      expect(sorted[0]!.getAttribute('aria-sort')).toBe('descending');
    });
  });

  describe('an inner tube', () => {
    it('can be picked at all, from the body tube rows', async () => {
      const { dialog, onApply } = await open('innertube');
      expect(headers(dialog)).toEqual(['Mfr.', 'Part no.', 'OD (mm)', 'ID (mm)', 'Length (mm)', 'Material', 'Notes']);
      fireEvent.change(within(dialog).getByLabelText(/Search parts/), { target: { value: 'mmt' } });
      expect(rows(dialog).length).toBeGreaterThan(10);
      fireEvent.click(dialog.querySelector('tbody tr')!);
      expect(onApply.mock.calls[0]![0]).toMatchObject({ type: 'bodytube' });
    });

    it('offers no fit control, because the motor it has to take is not in the tree', async () => {
      const { dialog } = await open('innertube', { parentInner: PM_TUBE.bore, foreMatch: PM_TUBE.od });
      expect(headers(dialog)).not.toContain('Fit (mm)');
      expect(within(dialog).queryByLabelText('Fits here')).toBeNull();
    });
  });

  describe('sorting the type-specific columns', () => {
    it('sorts a nose cone by shape', async () => {
      const { dialog } = await open('nosecone');
      fireEvent.click(head(dialog, 'Shape'));
      const shapes = rows(dialog).map((r) => r[2]!);
      expect(new Set(shapes).size).toBeGreaterThan(1);
      expect(shapes).toEqual([...shapes].sort((a, b) => a.localeCompare(b)));
      const th = [...dialog.querySelectorAll('thead th')].find((h) => h.textContent!.includes('Shape'))!;
      expect(th.getAttribute('aria-sort')).toBe('ascending');
    });

    it('sorts a parachute by drag coefficient', async () => {
      const { dialog } = await open('parachute');
      fireEvent.click(head(dialog, 'Drag coeff'));
      const th = [...dialog.querySelectorAll('thead th')].find((h) => h.textContent!.includes('Drag coeff'))!;
      expect(th.getAttribute('aria-sort')).toBe('ascending');
    });
  });

  it('marks a drag coefficient the catalog did not publish as a default', async () => {
    const { dialog } = await open('parachute');
    const cells = [...dialog.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')][3]!);
    const defaulted = cells.filter((c) => c.textContent === '(0.80)');
    expect(defaulted.length).toBeGreaterThan(0);
    for (const c of defaulted) expect(c.getAttribute('title')).toContain('does not publish');
    for (const c of cells.filter((c) => c.textContent !== '(0.80)')) {
      expect(c.textContent).toMatch(/^\d+\.\d{2}$/);
      expect(c.getAttribute('title') ?? '').toBe('');
    }
  });

  it('puts the filters on two rows with the way out on the right', async () => {
    const { dialog } = await open('bodytube');
    const search = within(dialog).getByLabelText(/Search parts/);
    const facets = within(dialog).getByLabelText('Mfr.').parentElement!;
    expect(facets.contains(search)).toBe(false);
    expect(facets.querySelectorAll('select').length).toBeGreaterThan(1);
    fireEvent.change(search, { target: { value: 'estes' } });
    const clear = clearFilters(dialog);
    expect(clear.className).toContain('ml-auto');
    expect(facets.contains(clear)).toBe(true);
  });

  it('holds its column widths still while you type', async () => {
    const { dialog } = await open('bodytube');
    const table = dialog.querySelector('table')!;
    expect(table.className).toContain('table-fixed');
    const widths = () =>
      [...dialog.querySelectorAll('thead th')].map((th) => th.className.match(/\bw-\d+\b/)?.[0] ?? null);
    const before = widths();
    expect(before.filter(Boolean).length).toBe(before.length - 1);
    fireEvent.change(within(dialog).getByLabelText(/Search parts/), { target: { value: 'estes' } });
    expect(widths()).toEqual(before);
    fireEvent.change(within(dialog).getByLabelText(/Search parts/), { target: { value: 'fiberglass filament' } });
    expect(widths()).toEqual(before);
  });

  it('puts the whole value on hover where a fixed width has to cut it off', async () => {
    const { dialog } = await open('bodytube');
    const cells = [...dialog.querySelectorAll('tbody tr')[0]!.querySelectorAll('td')];
    for (const td of cells) expect(td.className).toContain('truncate');
    const material = cells[5]!;
    expect(material.getAttribute('title')).toBeTruthy();
    expect(material.getAttribute('title')!.length).toBeGreaterThanOrEqual(material.textContent!.length);
  });

  it('applies the part that was clicked', async () => {
    const { dialog, onApply } = await open('bodytube');
    fireEvent.change(within(dialog).getByLabelText(/Search parts/), { target: { value: 'BT_1.15_12_MMT' } });
    const first = dialog.querySelector('tbody tr')!;
    fireEvent.click(first);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]![0]).toMatchObject({ partNo: 'BT_1.15_12_MMT', type: 'bodytube' });
  });

  it('applies from a real button in the part-number cell, so the table is not mouse-only', async () => {
    const { dialog, onApply } = await open('bodytube');
    fireEvent.change(within(dialog).getByLabelText(/Search parts/), { target: { value: 'BT_1.15_12_MMT' } });
    const first = dialog.querySelector('tbody tr')!;
    expect(first.getAttribute('role')).toBeNull();
    expect(first.hasAttribute('tabindex')).toBe(false);
    const apply = within(first as HTMLElement).getByRole('button', { name: 'BT_1.15_12_MMT' });
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});

describe('the part this component already is', () => {
  it('marks the linked row rather than leaving it in the pile', async () => {
    const { dialog, unmount } = await open('bodytube', undefined, { manufacturer: 'Estes', partNo: 'BT-50, 30352' });
    const marked = [...dialog.querySelectorAll('tbody tr[aria-current="true"]')];
    expect(marked).toHaveLength(1);
    expect(marked[0]!.textContent).toContain('BT-50, 30352');
    unmount();
  });

  it('marks only the linked maker’s row when two makers share a part number', async () => {
    const { dialog, unmount } = await open('centeringring', undefined, {
      manufacturer: 'Giant Leap',
      partNo: 'CR-38/29',
    });
    fireEvent.change(search(dialog), { target: { value: 'CR-38/29' } });
    expect(rows(dialog).filter((r) => r.join(' ').includes('CR-38/29')).length).toBeGreaterThan(1);
    const marked = [...dialog.querySelectorAll('tbody tr[aria-current="true"]')];
    expect(marked).toHaveLength(1);
    expect(marked[0]!.textContent).toContain('Giant Leap');
    unmount();
  });

  it('marks nothing when the component was typed rather than picked', async () => {
    const { dialog, unmount } = await open('bodytube');
    expect(dialog.querySelectorAll('tbody tr[aria-current="true"]')).toHaveLength(0);
    unmount();
  });
});
