// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MaterialSlotPicker } from '../../../src/components/design/MaterialSection';
import { FILLET_MATERIAL_KEYS, MATERIAL_KEYS } from '../../../src/services/design/materialSlots';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { serveData } from '../../testing/serveData';

const fin = { type: 'trapezoidfinset', id: 'f' } as ComponentNode;

describe('MaterialSlotPicker', () => {
  beforeAll(serveData);

  it("writes a fillet's name, density, group and shear modulus under the fillet keys", async () => {
    const onCommitChange = vi.fn();
    renderWithProviders(
      <MaterialSlotPicker
        node={fin}
        keys={FILLET_MATERIAL_KEYS}
        use="fillet"
        label="Fillet"
        onCommitChange={onCommitChange}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Fillet' });
    await waitFor(() => expect(screen.getByRole('option', { name: /^Plywood \(birch\)/ })).toBeTruthy());
    fireEvent.change(select, { target: { value: 'Plywood (birch)' } });
    expect(onCommitChange).toHaveBeenCalledWith({
      filletMaterialName: 'Plywood (birch)',
      filletDensity: expect.any(Number),
      filletMaterialGroup: expect.any(String),
      filletShearModulus: expect.any(Number),
    });
  });

  it('clears a surface slot back to its default, with no group or shear key', () => {
    const onCommitChange = vi.fn();
    renderWithProviders(
      <MaterialSlotPicker
        node={{ type: 'parachute', id: 'p', surfaceMaterialName: 'Mylar', surfaceDensity: 0.05 } as ComponentNode}
        keys={MATERIAL_KEYS.surface}
        type="surface"
        label="Canopy"
        onCommitChange={onCommitChange}
      />,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Canopy' }), { target: { value: '__default__' } });
    expect(onCommitChange).toHaveBeenCalledWith({ surfaceMaterialName: undefined, surfaceDensity: undefined });
  });
});
