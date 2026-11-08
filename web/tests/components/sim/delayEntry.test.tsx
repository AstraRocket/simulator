// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NumberInput } from '../../../src/components/common/NumberInput';

afterEach(cleanup);

describe('a cleared number box reports null rather than zero', () => {
  it('reports null, not 0, when the field is emptied', () => {
    const onChange = vi.fn();
    render(<NumberInput value={5} onChange={onChange} min={0} ariaLabel="delay" />);
    const box = screen.getByLabelText('delay');
    fireEvent.change(box, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
    expect(onChange).not.toHaveBeenCalledWith(0);
  });

  it('reports the number once one is typed', () => {
    const onChange = vi.fn();
    render(<NumberInput value={5} onChange={onChange} min={0} ariaLabel="delay" />);
    const box = screen.getByLabelText('delay');
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.change(box, { target: { value: '7' } });
    expect(onChange).toHaveBeenLastCalledWith(7);
  });

  it('clamps a typed value into the declared bounds', () => {
    const onChange = vi.fn();
    render(<NumberInput value={5} onChange={onChange} min={0} max={10} ariaLabel="delay" />);
    fireEvent.change(screen.getByLabelText('delay'), { target: { value: '-3' } });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });
});
