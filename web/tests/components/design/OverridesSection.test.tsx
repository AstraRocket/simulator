// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { OverridesSection } from '../../../src/components/design/OverridesSection';
import { renderWithProviders } from '../../testing/renderWithProviders';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';

/**
 * Select-all and retype empties an override box for a moment. That empty box
 * is not a typed 0: writing one would fly a 0 kg part (or a whole 0 kg stage
 * with "apply to all subcomponents" on) on every keystroke.
 */
const node = {
  id: 's',
  type: 'stage',
  overrideMass: 0.5,
  overrideCGX: 0.2,
  overrideCD: 0.6,
} as unknown as ComponentNode;

describe('OverridesSection on a part that only holds parts', () => {
  const applyAll = () => screen.queryAllByRole('checkbox', { name: 'Apply to all subcomponents' });

  it('covers the parts when an override is turned on, with no box to say so', () => {
    const onChange = vi.fn();
    const bare = { id: 's', type: 'stage' } as unknown as ComponentNode;
    renderWithProviders(<OverridesSection node={bare} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /^Mass/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ overrideSubcomponentsMass: true }));
  });

  it('hides the box while it is on, and shows it on a design that has it off', () => {
    const on = {
      ...node,
      overrideSubcomponentsMass: true,
      overrideSubcomponentsCG: true,
      overrideSubcomponentsCD: true,
    } as unknown as ComponentNode;
    const { unmount } = renderWithProviders(<OverridesSection node={on} onChange={vi.fn()} />);
    expect(applyAll()).toHaveLength(0);
    unmount();
    // `node` has all three overrides on and none covering the parts, as an imported .ork can.
    renderWithProviders(<OverridesSection node={node} onChange={vi.fn()} />);
    expect(applyAll()).toHaveLength(3);
  });

  it('leaves the choice to a part with a value of its own', () => {
    const onChange = vi.fn();
    const tube = { id: 'b', type: 'bodytube', overrideSubcomponentsMass: true } as unknown as ComponentNode;
    renderWithProviders(<OverridesSection node={{ ...tube, overrideMass: 0.1 }} onChange={onChange} />);
    expect(applyAll()).toHaveLength(1);
    renderWithProviders(
      <OverridesSection node={{ id: 'c', type: 'bodytube' } as unknown as ComponentNode} onChange={onChange} />,
    );
    fireEvent.click(screen.getAllByRole('checkbox', { name: /^Mass/ })[1]!);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ overrideSubcomponentsMass: undefined }));
  });
});

describe('OverridesSection with a cleared box', () => {
  it.each([
    ['Mass', 'overrideMass'],
    ['CG (from nose tip)', 'overrideCGX'],
    ['Drag coeff (Cd)', 'overrideCD'],
  ])('writes nothing while the %s box is empty', (label) => {
    const onChange = vi.fn();
    renderWithProviders(<OverridesSection node={node} onChange={onChange} />);
    const box = screen.getByRole('spinbutton', { name: label });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('still writes a typed value', () => {
    const onChange = vi.fn();
    renderWithProviders(<OverridesSection node={node} onChange={onChange} />);
    const box = screen.getByRole('spinbutton', { name: 'Drag coeff (Cd)' });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '0.7' } });
    expect(onChange).toHaveBeenCalledWith({ overrideCD: 0.7 });
  });
});
