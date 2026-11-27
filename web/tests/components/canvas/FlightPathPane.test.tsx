// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { FlightPathPane } from '../../../src/components/canvas/FlightPathPane';
import { renderWithProviders } from '../../testing/renderWithProviders';
import type { FlightResult, RocketTree } from '../../../src/engine/openRocketEngine';
import type { ResultFlight } from '../../../src/services/flight/simulations';

// WebGL does not run under jsdom: each view stands in as a marker.
vi.mock('../../../src/components/canvas/FlightPath3D', () => ({ FlightPath3D: () => <div>flight view</div> }));
vi.mock('../../../src/components/canvas/PadPreview3D', () => ({ PadPreview3D: () => <div>pad view</div> }));
vi.mock('../../../src/components/canvas/FlightPathExport', () => ({ FlightPathExport: () => null }));

const result = {} as FlightResult;
const flight = { id: 'a', name: 'A', result, launch: {} } as unknown as ResultFlight;

const pane = (flown: boolean) =>
  renderWithProviders(
    <FlightPathPane
      flight={flown ? flight : null}
      pathResult={flown ? result : null}
      design={{ components: [] } as unknown as RocketTree}
      loading={null}
    />,
  );

describe('the flight path pane', () => {
  it('shows the pad before any run', async () => {
    pane(false);
    expect(await screen.findByText('pad view')).toBeTruthy();
    expect(screen.getByText(/simulation/i)).toBeTruthy();
  });

  it('shows the flight once there is one', async () => {
    pane(true);
    expect(await screen.findByText('flight view')).toBeTruthy();
    expect(screen.queryByText('pad view')).toBeNull();
  });
});
