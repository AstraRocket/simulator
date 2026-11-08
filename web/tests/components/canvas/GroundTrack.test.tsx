// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { GroundTrack } from '../../../src/components/canvas/GroundTrack';
import { DriftSweepPanel } from '../../../src/components/canvas/DriftSweepPanel';
import { renderWithProviders, seedSettings } from '../../testing/renderWithProviders';
import type { ChartFlight } from '../../../src/components/canvas/FlightChart';
import type { LaunchConditions } from '../../../src/services/design/orkTree';
import { useWorkspaceStore } from '../../../src/state/store';
import { defaultSweepSpec, type DriftSweep } from '../../../src/services/flight/windSweep';
import { resultKey, simInputs } from '../../../src/services/flight/simulations';
import { TILE_SOURCES } from '../../../src/services/map/slippyMap';

const st = () => useWorkspaceStore.getState();

// jsdom never fetches `<img>` and has no ResizeObserver, so the view keeps its 420 px default.

const LAUNCH = {
  launchRodLengthM: 1,
  launchRodAngleDeg: 0,
  windAverage: 4,
  windStdDev: 0.4,
  windDirectionDeg: 90,
  launchAltitudeM: 1800,
  latitudeDeg: 39.05,
  longitudeDeg: -104.8,
  temperatureC: null,
  pressureHPa: null,
} satisfies LaunchConditions;

const HOME = { latitudeDeg: 39.05, longitudeDeg: -104.8, launch: LAUNCH };

const flight = (): ChartFlight =>
  ({
    id: 'sim-1',
    name: 'Simulation 1',
    result: {
      summary: {},
      events: [],
      series: {
        time: [0, 1, 2, 3],
        altitude: [0, 100, 60, 0],
        Px: [0, 100, 300, 500],
        Py: [0, 120, 320, 500],
      },
    },
  }) as unknown as ChartFlight;

const tiles = () => Array.from(document.querySelectorAll('img')).map((el) => el.getAttribute('src') ?? '');

// The imagery choice is module-scoped, so each test sets it and resets it after.
const showImagery = () => fireEvent.click(screen.getByRole('button', { name: 'Satellite' }));

const hideImagery = () => fireEvent.click(screen.getByRole('button', { name: 'None' }));

describe('GroundTrack imagery', () => {
  it('asks for no tiles at all until the ground is turned on', () => {
    renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);
    expect(tiles()).toHaveLength(0);
    // jest-dom's matchers are not loaded here, so read the attribute directly.
    expect(screen.getByRole('button', { name: 'None' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('img', { name: /over the ground/i })).toBeTruthy();
    expect(screen.queryByText(/Esri/)).toBeNull();
  });

  it('draws tiles centered on the site the flight was flown from', () => {
    renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);
    showImagery();
    const sources = tiles();
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((s) => s.includes('World_Imagery/MapServer/tile/'))).toBe(true);
    // Never OpenStreetMap's own volunteer servers: see the note in slippyMap.ts.
    expect(sources.some((s) => s.includes('openstreetmap.org'))).toBe(false);
    hideImagery();
  });

  it('zooms to the track rather than to a fixed site zoom', () => {
    const zoomOf = (sources: string[]) => Number(sources[0]!.match(/MapServer\/tile\/(\d+)\//)![1]);

    const { unmount } = renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);
    showImagery();
    const near = zoomOf(tiles());
    unmount();

    const far = flight();
    far.result.series.Px = [0, 1000, 3000, 5000];
    far.result.series.Py = [0, 1200, 3200, 5000];
    renderWithProviders(<GroundTrack flight={far} {...HOME} />);
    showImagery();
    expect(zoomOf(tiles())).toBeLessThan(near);
    hideImagery();
  });

  it('carries the provider attribution the tiles require', () => {
    renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);
    showImagery();
    expect(screen.getByText(TILE_SOURCES.satellite.attribution)).toBeTruthy();
    hideImagery();
  });

  it('switches layers, and turns the imagery off entirely', () => {
    renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);

    fireEvent.click(screen.getByRole('button', { name: 'Street' }));
    expect(tiles().every((s) => s.includes('World_Street_Map/MapServer/tile/'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(tiles()).toHaveLength(0);
    expect(screen.getByRole('img', { name: /over the ground/i })).toBeTruthy();

    hideImagery();
  });

  it('draws the bare plan view, with no layer buttons, when the site is blank', () => {
    renderWithProviders(<GroundTrack flight={flight()} latitudeDeg={null} longitudeDeg={null} launch={LAUNCH} />);
    expect(tiles()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Satellite' })).toBeNull();
    expect(screen.getByRole('img', { name: /over the ground/i })).toBeTruthy();
  });

  it('still draws a map when the rocket lands on the pad', () => {
    const calm = flight();
    calm.result.series.Px = [0, 0.03, 0.07, 0.11];
    calm.result.series.Py = [0, 0.01, 0.02, 0.02];
    renderWithProviders(<GroundTrack flight={calm} {...HOME} />);
    showImagery();

    expect(tiles().length).toBeGreaterThan(0);
    expect(screen.queryByText('No imagery at this zoom level')).toBeNull();
    const labels = Array.from(document.querySelectorAll('svg[role="img"] text')).map((el) => el.textContent ?? '');
    expect(labels.some((x) => /^[1-9]\d*(\.\d+)? m$/.test(x))).toBe(true);
    expect(labels.some((x) => /^0\.\d+ m$/.test(x))).toBe(false);
    hideImagery();
  });

  it('falls back to the bare plan view when the tiles do not arrive', () => {
    renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);
    showImagery();
    const imgs = Array.from(document.querySelectorAll('img'));
    expect(imgs.length).toBeGreaterThan(2);
    for (const img of imgs) fireEvent.error(img);

    expect(tiles()).toHaveLength(0);
    expect(screen.getByText('No imagery offline')).toBeTruthy();
    expect(screen.getByRole('img', { name: /over the ground/i })).toBeTruthy();

    showImagery();
    expect(tiles().length).toBeGreaterThan(0);
    hideImagery();
  });
});

describe('GroundTrack drift region', () => {
  // Without row `sim-1` every sweep reads as stale and the staleness test passes vacuously.
  beforeEach(() => {
    useWorkspaceStore.setState({ sims: st().sims.map((x, i) => (i === 0 ? { ...x, id: 'sim-1' } : x)) });
  });

  const sweep = (simId: string, tree = st().tree): DriftSweep => ({
    simId,
    tree,
    inputs: simInputs(st().sims[0]!, st().configs[0]!),
    key: resultKey(st().tree, st().configs[0]!, st().sims[0]!, st().simPrefs),
    spec: defaultSweepSpec(4),
    asked: 4,
    flown: 4,
    landings: [
      { branch: 0, east: 400, north: 400, speedMs: 2, headingDeg: 0 },
      { branch: 0, east: -400, north: 400, speedMs: 2, headingDeg: 90 },
      { branch: 0, east: -400, north: -400, speedMs: 6, headingDeg: 180 },
      { branch: 0, east: 400, north: -400, speedMs: 6, headingDeg: 270 },
    ],
  });

  afterEach(() => useWorkspaceStore.setState({ driftSweep: null, driftSweepRun: null }));

  const shapes = () => Array.from(document.querySelectorAll('svg[role="img"] polygon'));

  it('draws the envelope, the ellipse and every swept landing', () => {
    useWorkspaceStore.setState({ driftSweep: sweep('sim-1') });
    renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);
    expect(shapes()).toHaveLength(2);
    expect(shapes()[0]!.getAttribute('fill-opacity')).toBe('0.14');
    expect(shapes()[1]!.getAttribute('stroke-dasharray')).toBeTruthy();
    // Landing markers are unfilled rings, so filled circles are the samples.
    const dots = Array.from(document.querySelectorAll('svg[role="img"] circle')).filter(
      (c) => c.getAttribute('r') === '1.6',
    );
    expect(dots).toHaveLength(4);
  });

  it('says a sweep is flown on the closed Drift button, not by its fill alone', () => {
    useWorkspaceStore.setState({ driftSweep: sweep('sim-1') });
    renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);
    expect(screen.getByRole('button', { name: 'Drift (sweep flown)', expanded: false })).toBeTruthy();
  });

  it('names the Drift button plainly when no sweep is flown', () => {
    useWorkspaceStore.setState({ driftSweep: sweep('some-other-sim') });
    renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);
    expect(screen.getByRole('button', { name: 'Drift' })).toBeTruthy();
  });

  it('ignores a sweep flown for another simulation', () => {
    useWorkspaceStore.setState({ driftSweep: sweep('some-other-sim') });
    renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);
    expect(shapes()).toHaveLength(0);
  });

  it('widens the frame to hold a region bigger than the track', () => {
    const labels = () =>
      Array.from(document.querySelectorAll('svg[role="img"] text')).map((el) => el.textContent ?? '');
    const { unmount } = renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);
    const withoutSweep = labels();
    unmount();

    useWorkspaceStore.setState({ driftSweep: sweep('sim-1') });
    renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);
    const biggest = (xs: string[]) => Math.max(...xs.flatMap((x) => (/^(\d+) m$/.exec(x) ? [Number(RegExp.$1)] : [])));
    expect(biggest(labels())).toBeGreaterThan(biggest(withoutSweep));
  });

  it('reads each stage band from its own branch when an earlier track is too short to draw', () => {
    const staged = {
      ...flight(),
      result: {
        summary: {},
        events: [],
        series: { time: [0], altitude: [0], Px: [0], Py: [0] },
        branches: [
          { name: 'Sustainer', events: [], series: { time: [0], altitude: [0], Px: [0], Py: [0] } },
          { name: 'Booster', events: [], series: flight().result.series },
        ],
      },
    } as unknown as ChartFlight;
    const booster = sweep('sim-1');
    useWorkspaceStore.setState({
      driftSweep: { ...booster, landings: booster.landings.map((l) => ({ ...l, branch: 1 })) },
    });
    renderWithProviders(<GroundTrack flight={staged} {...HOME} />);
    expect(screen.getByText('Booster').parentElement!.textContent).toContain('(566–566 m)');
  });

  it('reads out the swept range band beside the flown one', () => {
    useWorkspaceStore.setState({ driftSweep: sweep('sim-1') });
    renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);
    expect(screen.getByText('(566–566 m)')).toBeTruthy();
  });

  it('reads landing distances in the Downrange unit', () => {
    seedSettings({ unitOverrides: { 'sim.downrange': 'ft' } });
    useWorkspaceStore.setState({ driftSweep: sweep('sim-1') });
    renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);
    try {
      // 400√2 m is 1,855.9 ft, at 0 decimals past 100.
      expect(screen.getByText('(1,856–1,856 ft)')).toBeTruthy();
    } finally {
      localStorage.clear();
    }
  });

  it('flags a region older than what is on screen, without dropping it', () => {
    useWorkspaceStore.setState({ driftSweep: sweep('sim-1') });
    const { unmount } = renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);
    fireEvent.click(screen.getByRole('button', { name: /^Drift/ }));
    expect(screen.queryByText(/design or its simulation settings have changed/i)).toBeNull();
    unmount();

    useWorkspaceStore.setState({ driftSweep: { ...sweep('sim-1'), tree: { ...st().tree } } });
    renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);
    expect(shapes()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /^Drift/ }));
    expect(screen.getByText(/design or its simulation settings have changed/i)).toBeTruthy();
  });

  it('says on the panel that the region is experimental', () => {
    renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);
    fireEvent.click(screen.getByRole('button', { name: 'Drift' }));
    expect(screen.getByText('Experimental')).toBeTruthy();
    expect(screen.getByText(/not a range clearance/i)).toBeTruthy();
  });

  it('opens the sweep controls from the Drift button', () => {
    renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);
    expect(screen.queryByRole('button', { name: 'Run sweep' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Drift' }));
    expect(screen.getByRole('button', { name: 'Run sweep' })).toBeTruthy();
    expect((screen.getByLabelText('Speeds') as HTMLInputElement).value).toBe('4');
    expect((screen.getByLabelText('Headings') as HTMLInputElement).value).toBe('8');
    expect(screen.getByText('32 flights')).toBeTruthy();
  });
});

describe('GroundTrack angle readouts', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('prints a landing bearing in radians when the angle unit is radians', () => {
    seedSettings({ units: { angle: 'rad' } });
    renderWithProviders(<GroundTrack flight={flight()} {...HOME} />);
    expect(screen.getByText(/707 m · 0\.79 rad/)).toBeTruthy();
  });

  it('prints the sweep heading spans in radians when the angle unit is radians', () => {
    seedSettings({ units: { angle: 'rad' } });
    renderWithProviders(<DriftSweepPanel simId="sim-1" launch={LAUNCH} />);
    const spans = screen.getAllByRole('option').map((o) => o.textContent);
    expect(spans).toContain('±1.57 rad');
    expect(spans.join('')).not.toContain('°');
  });
});
