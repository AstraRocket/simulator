// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { SelectRow } from '../../../src/components/common/SelectRow';
import { renderWithProviders } from '../../testing/renderWithProviders';

const options = (
  <>
    <option value="a">A</option>
    <option value="b">B</option>
  </>
);

describe('SelectRow', () => {
  it('is named by its label and reports the picked value', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <SelectRow label="Paper" value="a" onChange={onChange}>
        {options}
      </SelectRow>,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Paper' }), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('has a focus ring and takes the width', () => {
    renderWithProviders(
      <SelectRow label="Paper" value="a" onChange={() => {}} width="w-32">
        {options}
      </SelectRow>,
    );
    const cls = screen.getByRole('combobox', { name: 'Paper' }).className;
    expect(cls).toContain('focus:ring-accent-500');
    expect(cls).toContain('w-32');
  });

  it('marks a mixed value on the select ring', () => {
    renderWithProviders(
      <SelectRow label="Paper" value="a" onChange={() => {}} mixed>
        {options}
      </SelectRow>,
    );
    const cls = screen.getByRole('combobox', { name: /^Paper/ }).className;
    expect(cls).toContain('ring-warn-500/60');
    expect(cls).not.toContain('ring-line/10');
  });

  it('disables the select', () => {
    renderWithProviders(
      <SelectRow label="Paper" value="a" onChange={() => {}} disabled>
        {options}
      </SelectRow>,
    );
    expect((screen.getByRole('combobox', { name: 'Paper' }) as HTMLSelectElement).disabled).toBe(true);
  });
});
