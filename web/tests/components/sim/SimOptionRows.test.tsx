// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { KernelMethodRows, StepperSelect } from '../../../src/components/sim/SimOptionRows';
import { renderWithProviders } from '../../testing/renderWithProviders';

describe('KernelMethodRows', () => {
  it('lists each fixed kernel method as a term and its value', () => {
    renderWithProviders(<KernelMethodRows size="xs" />);
    expect(screen.getAllByRole('term').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('definition')[0]!.className).toContain('text-xs');
  });
});

describe('StepperSelect', () => {
  it('offers each stepper and reports the pick', () => {
    const onChange = vi.fn();
    renderWithProviders(<StepperSelect value="rk4" onChange={onChange} />);
    const select = screen.getByRole('combobox');
    expect(select.querySelectorAll('option')).toHaveLength(2);
    fireEvent.change(select, { target: { value: 'rk6' } });
    expect(onChange).toHaveBeenCalledWith('rk6');
  });

  it('adds a follow-the-default choice when given its label', () => {
    renderWithProviders(<StepperSelect value="" onChange={() => {}} defaultLabel="Default (RK4)" />);
    expect((screen.getByRole('option', { name: 'Default (RK4)' }) as HTMLOptionElement).value).toBe('');
  });
});
