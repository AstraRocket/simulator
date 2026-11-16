// @vitest-environment jsdom
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { StackedField } from '../../../src/components/common/StackedField';
import { renderWithProviders } from '../../testing/renderWithProviders';

describe('StackedField', () => {
  it('is named by its label and passes the input props through', () => {
    const onChange = vi.fn();
    const ref = createRef<HTMLInputElement>();
    renderWithProviders(
      <StackedField id="f-name" label="Name" ref={ref} value="Alpha" maxLength={80} onChange={onChange} />,
    );
    const box = screen.getByRole('textbox', { name: 'Name' });
    expect(ref.current).toBe(box);
    expect(box.getAttribute('maxlength')).toBe('80');
    expect(box.className).toContain('focus:ring-accent-500');
    fireEvent.change(box, { target: { value: 'Beta' } });
    expect(onChange).toHaveBeenCalledOnce();
  });
});
