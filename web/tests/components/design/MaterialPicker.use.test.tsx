// @vitest-environment jsdom
import { beforeAll, describe, it, expect } from 'vitest';
import { cleanup, waitFor } from '@testing-library/react';
import { serveData } from '../../testing/serveData';
import { MaterialPicker } from '../../../src/components/design/MaterialPicker';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { addCustom } from '../../../src/services/materials/materials';
import { ADHESIVE_GROUP } from '../../../src/services/materials/materialTypes';

// With a material chosen, the UnitChip is a second combobox.
const materialSelect = () =>
  [...document.querySelectorAll('select')].find((s) => s.querySelector('optgroup')) as HTMLSelectElement | undefined;

const groupsOf = async () => {
  await waitFor(() => {
    if (!materialSelect()) throw new Error('not loaded');
  });
  return [...materialSelect()!.querySelectorAll('optgroup')].map((g) => g.getAttribute('label'));
};

const optionNames = () =>
  [...(materialSelect()?.querySelectorAll('option') ?? [])].map((o) => (o.textContent ?? '').split(' · ')[0]!.trim());

describe('MaterialPicker, by use', () => {
  beforeAll(serveData);

  it('leaves the adhesives out of a structural part', async () => {
    renderWithProviders(<MaterialPicker value={undefined} onChange={() => {}} />);
    expect(await groupsOf()).not.toContain(ADHESIVE_GROUP);
    expect(optionNames().some((n) => n.startsWith('Epoxy -'))).toBe(false);
    expect(optionNames()).toContain('Plywood (birch)');
  });

  it('offers a fillet the adhesives and every other bulk material', async () => {
    renderWithProviders(<MaterialPicker value={undefined} onChange={() => {}} use="fillet" />);
    expect(await groupsOf()).toContain(ADHESIVE_GROUP);
    expect(optionNames()).toContain('Epoxy - RocketPoxy G5000');
    expect(optionNames()).toContain('Plywood (birch)');
    expect(optionNames()).toContain('Aluminum');
  });

  it('still shows a non-adhesive a fillet already uses', async () => {
    renderWithProviders(<MaterialPicker value="Plywood (birch)" onChange={() => {}} use="fillet" />);
    await waitFor(() => expect(optionNames()).toContain('Plywood (birch)'));
    expect(materialSelect()!.value).toBe('Plywood (birch)');
  });

  it('still shows a material the part already uses, even when it would be filtered', async () => {
    renderWithProviders(<MaterialPicker value="Epoxy - RocketPoxy G5000" onChange={() => {}} />);
    await waitFor(() => expect(optionNames()).toContain('Epoxy - RocketPoxy G5000'));
    expect(materialSelect()!.value).toBe('Epoxy - RocketPoxy G5000');
  });

  it('shows a custom material filed under Adhesives on a fillet, not on a tube', async () => {
    await addCustom('My thickened mix', 'bulk', 1050, ADHESIVE_GROUP);

    renderWithProviders(<MaterialPicker value={undefined} onChange={() => {}} use="fillet" />);
    await waitFor(() => expect(optionNames()).toContain('★ My thickened mix'));
    cleanup();

    renderWithProviders(<MaterialPicker value={undefined} onChange={() => {}} />);
    await groupsOf();
    expect(optionNames()).not.toContain('★ My thickened mix');
  });
});
