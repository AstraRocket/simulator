// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { LandingMap } from '../../../../src/components/common/map/LandingMap';
import { useUnits } from '../../../../src/prefs/useUnits';
import { MIN_EXTENT_M } from '../../../../src/services/flight/groundTrack';
import { renderWithProviders } from '../../../testing/renderWithProviders';

// jsdom has no ResizeObserver: 320 px default, half 160, minus the 18 px pad = 142 px.
function Harness({ east }: { east: number }) {
  const u = useUnits();
  return (
    <LandingMap
      latitudeDeg={39}
      longitudeDeg={-105}
      path={[{ east: 0, north: 0 }]}
      landing={{ east, north: 0 }}
      samples={[]}
      ellipse={null}
      distanceUnit={u.plain('distance')}
    />
  );
}

const landingX = (container: HTMLElement): number => {
  const ring = [...container.querySelectorAll('circle')].find((c) => c.getAttribute('r') === '5');
  return Number(ring?.getAttribute('cx'));
};

describe('LandingMap extent', () => {
  it('floors the frame at the ground track minimum', () => {
    const { container } = renderWithProviders(<Harness east={10} />);
    expect(landingX(container)).toBeCloseTo(160 + (10 * 142) / MIN_EXTENT_M, 6);
  });

  it('leaves a tenth of air around a landing past the floor', () => {
    const { container } = renderWithProviders(<Harness east={200} />);
    expect(landingX(container)).toBeCloseTo(160 + (200 * 142) / (200 * 1.1), 6);
  });
});
