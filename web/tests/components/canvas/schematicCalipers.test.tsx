// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { HorizontalCaliper, VerticalCaliper } from '../../../src/components/canvas/SchematicCalipers';
import { renderWithProviders } from '../../testing/renderWithProviders';

/**
 * Zoomed in on the tail, the nose (the datum) is far off the left edge. The
 * calipers' lines still cross the view there, so their grips and readouts must
 * too: the visible span is 46..954 px.
 */
describe('the calipers under a zoom past the nose', () => {
  const noop = () => () => {};
  // Nose at -500 px, 100 px per meter, a 10 m airframe: the tail at 500 px.
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
    // The readout box is centered 20 px in from the grip.
    expect(container.querySelector('g[pointer-events="none"] rect')?.getAttribute('x')).toBe('36');
  });

  it('keeps the length readout in view when both lines are off screen', () => {
    const { container } = renderWithProviders(
      <svg>
        <HorizontalCaliper {...props} cal={{ a: 0, b: 0.5 }} h={200} rBot={0} />
      </svg>,
    );
    // Both lines sit left of the view (-500 and -450 px); the 56 px tag is
    // held 28 px in from the view's left edge.
    expect(container.querySelector('g[pointer-events="none"] rect')?.getAttribute('x')).toBe('46');
  });
});
