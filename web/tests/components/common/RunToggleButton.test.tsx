// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RunToggleButton } from '../../../src/components/common/RunToggleButton';

describe('RunToggleButton', () => {
  it('leads the idle label with a hidden play glyph and drops it while busy', () => {
    const { rerender } = render(<RunToggleButton busy={false} label="Run" onClick={() => {}} glyph="lead" />);
    const button = screen.getByRole('button', { name: 'Run' });
    expect(button.querySelector('[aria-hidden]')).not.toBeNull();
    expect(button.className).toContain('bg-accent-600');
    rerender(<RunToggleButton busy label="Cancel" onClick={() => {}} glyph="lead" />);
    const busy = screen.getByRole('button', { name: 'Cancel' });
    expect(busy.querySelector('[aria-hidden]')).toBeNull();
    expect(busy.className).toContain('bg-prominent');
  });

  it('names a glyph-only button by its label', () => {
    const onClick = vi.fn();
    render(<RunToggleButton busy label="Cancel run" onClick={onClick} glyph="only" size="xs" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire when disabled', () => {
    const onClick = vi.fn();
    render(<RunToggleButton busy={false} label="Run" onClick={onClick} disabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
