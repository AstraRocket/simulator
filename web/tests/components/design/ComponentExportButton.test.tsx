// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { ComponentExportButton } from '../../../src/components/design/ComponentExportButton';
import { renderWithProviders } from '../../testing/renderWithProviders';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';

const fin = { type: 'trapezoidfinset', id: 'f1' } as unknown as ComponentNode;

/** jsdom has no matchMedia; the button asks it whether this is a desktop window. */
const setWindow = (desktop: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  })) as unknown as typeof window.matchMedia;
};

/** The per-part export menu follows the ARIA menu keyboard model its role promises. */
describe('ComponentExportButton menu keys', () => {
  beforeEach(() => setWindow(true));

  it('opens onto the first format and walks the rest with the arrows', () => {
    renderWithProviders(<ComponentExportButton node={fin} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    const items = screen.getAllByRole('menuitem');
    expect(items.length).toBeGreaterThan(1);
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
  });
});

/** STL, OBJ, 3MF and DXF are for desktop programs; a phone or tablet keeps GLB only. */
describe('ComponentExportButton formats on a phone', () => {
  it('offers every format of a fin set on a desktop window', () => {
    setWindow(true);
    renderWithProviders(<ComponentExportButton node={fin} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    const names = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(names).toContain('3D scene (.glb)');
    expect(names.length).toBe(5);
  });

  it('offers only GLB at phone width', () => {
    setWindow(false);
    renderWithProviders(<ComponentExportButton node={fin} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['3D scene (.glb)']);
  });
});
