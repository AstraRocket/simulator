// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { ViewToggle } from '../../../src/components/canvas/ViewToggle';
import { renderWithProviders } from '../../testing/renderWithProviders';

const g = globalThis as { __astraGraphics?: unknown };

afterEach(() => {
  delete g.__astraGraphics;
});

describe('ViewToggle with 3D off', () => {
  it('disables the 3D view and says why', () => {
    g.__astraGraphics = { enabled: false, reason: 'slow' };
    renderWithProviders(<ViewToggle view="2d" onChange={vi.fn()} family="design" />);
    const threeD = screen.getByRole('button', { name: '3D' });
    expect((threeD as HTMLButtonElement).disabled).toBe(true);
    expect(threeD.getAttribute('title')).toBe("3D is off: this device's graphics are too slow for it.");
    expect((screen.getByRole('button', { name: '2D' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables the 3D path among the result views', () => {
    g.__astraGraphics = { enabled: false, reason: 'none' };
    renderWithProviders(<ViewToggle view="flight" onChange={vi.fn()} family="result" />);
    expect((screen.getByRole('button', { name: '3D path' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Flight' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('leaves every view on when 3D is on', () => {
    renderWithProviders(<ViewToggle view="2d" onChange={vi.fn()} family="design" />);
    expect((screen.getByRole('button', { name: '3D' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
