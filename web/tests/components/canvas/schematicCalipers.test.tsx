// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { HorizontalCaliper, VerticalCaliper } from '../../../src/components/canvas/SchematicCalipers';
import { renderWithProviders } from '../../testing/renderWithProviders';

describe('the calipers under a zoom past the nose', () => {
  const noop = () => () => {};
  const props = {
    ctx: { scale: 100, cy: 100, x0: -500 },
    scale: 100,
    totalLen: 10,
    viewX0: 46,
    viewX1: 954,
    onDragStart: noop,
    onKey: noop,
  };

  it('keeps the diameter grips and readout at the view edge', () => {
    const { container } = renderWithProviders(
      <svg>
        <VerticalCaliper {...props} cal={{ a: 0.1, b: -0.1 }} vHalf={0.5} />
      </svg>,
    );
    const grips = container.querySelectorAll('[role="slider"]');
    expect([...grips].map((g) => g.getAttribute('x'))).toEqual(['42', '42']);
    expect(container.querySelector('g[pointer-events="none"] rect')?.getAttribute('x')).toBe('36');
  });

  it('keeps the length readout in view when both lines are off screen', () => {
    const { container } = renderWithProviders(
      <svg>
        <HorizontalCaliper {...props} cal={{ a: 0, b: 0.5 }} h={200} rBot={0} />
      </svg>,
    );
    expect(container.querySelector('g[pointer-events="none"] rect')?.getAttribute('x')).toBe('46');
  });
});
