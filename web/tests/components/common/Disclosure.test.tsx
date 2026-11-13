// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { Disclosure } from '../../../src/components/common/Disclosure';
import { renderWithProviders } from '../../testing/renderWithProviders';

describe('Disclosure', () => {
  it('puts the toggle inside the heading and reports its state', () => {
    const onToggle = vi.fn();
    renderWithProviders(<Disclosure open={false} onToggle={onToggle} label="Notes" />);
    const button = screen.getByRole('button', { name: 'Notes' });
    expect(screen.getByRole('heading', { level: 2, name: 'Notes' }).contains(button)).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('hides the glyph from screen readers and shows the folded summary', () => {
    renderWithProviders(<Disclosure open onToggle={() => {}} label="Stage" as="h3" after={<span>· Nose</span>} />);
    screen.getByRole('heading', { level: 3 });
    expect(screen.getByText('▾').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
    screen.getByText('· Nose');
  });

  it('renders a bare button with no heading', () => {
    renderWithProviders(<Disclosure open={false} onToggle={() => {}} label="Stats" as={null} />);
    expect(screen.queryByRole('heading')).toBeNull();
    screen.getByRole('button', { name: 'Stats' });
  });
});
