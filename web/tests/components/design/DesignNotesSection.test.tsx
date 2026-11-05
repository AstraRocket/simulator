// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { DesignNotesSection } from '../../../src/components/design/DesignNotesSection';
import { useWorkspaceStore } from '../../../src/state/store';
import { renderWithProviders } from '../../testing/renderWithProviders';

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

describe('DesignNotesSection', () => {
  const updateDesignMeta = vi.fn();
  beforeEach(() => {
    updateDesignMeta.mockClear();
    useWorkspaceStore.setState({
      tree: { name: 'R', components: [], designer: 'Ann', designType: 'imported_token' },
      updateDesignMeta,
    } as never);
  });

  const expand = () => {
    renderWithProviders(<DesignNotesSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Design notes' }));
  };

  it('starts collapsed and opens from its heading', () => {
    renderWithProviders(<DesignNotesSection />);
    const heading = screen.getByRole('button', { name: 'Design notes' });
    expect(heading.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Designer')).toBeNull();
    fireEvent.click(heading);
    expect((screen.getByLabelText('Designer') as HTMLInputElement).value).toBe('Ann');
  });

  it('commits a trimmed value on blur, and an emptied field as absent', () => {
    expand();
    const designer = screen.getByLabelText('Designer');
    fireEvent.change(designer, { target: { value: '  Bea ' } });
    fireEvent.blur(designer);
    expect(updateDesignMeta).toHaveBeenLastCalledWith({ designer: 'Bea' });
    fireEvent.change(designer, { target: { value: ' ' } });
    fireEvent.blur(designer);
    expect(updateDesignMeta).toHaveBeenLastCalledWith({ designer: undefined });
  });

  it('keeps an unrecognized imported design type selectable', () => {
    expand();
    const select = screen.getByLabelText('Design type') as HTMLSelectElement;
    expect(select.value).toBe('imported_token');
    expect([...select.options].some((o) => o.text === 'imported_token')).toBe(true);
    fireEvent.change(select, { target: { value: 'kit_bash' } });
    expect(updateDesignMeta).toHaveBeenLastCalledWith({ designType: 'kit_bash' });
  });
});
