// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { SiteMapButton } from '../../../src/components/sim/SiteMapDialog';
import { mapButtonClass } from '../../../src/components/common/map/mapButton';
import { renderWithProviders } from '../../testing/renderWithProviders';

describe('SiteMapButton', () => {
  it('opens the site map only when pressed', () => {
    renderWithProviders(<SiteMapButton latitudeDeg={39.05} longitudeDeg={-104.8} onPick={() => {}} className="btn" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show on map' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('mapButtonClass', () => {
  it('fills only the active button', () => {
    expect(mapButtonClass(true)).toContain('bg-accent-600');
    expect(mapButtonClass(false)).not.toContain('bg-accent-600');
  });
});
