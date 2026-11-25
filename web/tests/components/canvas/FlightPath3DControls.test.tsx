// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { FlightResult, RocketTree } from '../../../src/engine/openRocketEngine';
import { readSettings, renderWithProviders } from '../../testing/renderWithProviders';

// jsdom has no WebGL, so only the HTML controls mount.
vi.mock('@react-three/fiber', () => ({
  Canvas: () => null,
  useFrame: () => {},
  useThree: () => ({}),
}));
vi.mock('@react-three/drei', () => ({ OrbitControls: () => null, Line: () => null, Html: () => null }));

const { FlightPath3D } = await import('../../../src/components/canvas/FlightPath3D');

afterEach(cleanup);

const result = {
  summary: { timeToApogee: 2 },
  events: [],
  series: {
    time: [0, 1, 2, 3, 4],
    altitude: [0, 50, 80, 50, 0],
    velocity: [0, 40, 0, -20, -5],
    Px: [0, 1, 2, 3, 4],
    Py: [0, 1, 2, 3, 4],
  },
} as unknown as FlightResult;
const tree = { name: 'T', components: [] } as unknown as RocketTree;

const pointerReachable = (el: Element): boolean => {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (n.classList.contains('pointer-events-auto')) return true;
    if (n.classList.contains('pointer-events-none')) return false;
  }
  return true;
};

describe('3D flight path controls', () => {
  it('lets a pointer reach the phase-color swatches', () => {
    renderWithProviders(<FlightPath3D result={result} tree={tree} />);
    const swatches = document.querySelectorAll('input[type="color"], label input');
    expect(swatches.length).toBeGreaterThanOrEqual(3);
    for (const s of swatches) expect(pointerReachable(s)).toBe(true);
  });

  it('names the playback slider and the speed select', () => {
    renderWithProviders(<FlightPath3D result={result} tree={tree} />);
    expect(screen.getByRole('slider').getAttribute('aria-label')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Playback speed' })).toBeTruthy();
  });

  it('offers no part to track on a flight of one', () => {
    renderWithProviders(<FlightPath3D result={result} tree={tree} />);
    expect(screen.queryByRole('combobox', { name: 'Part of the rocket to track' })).toBeNull();
  });

  it('tells apart the stages it offers to track, named alike', () => {
    const series = result.series;
    const branches = ['Sustainer', 'Booster', 'Booster'].map((name) => ({ name, events: [], series }));
    renderWithProviders(<FlightPath3D result={{ ...result, branches }} tree={tree} />);
    const options = [...screen.getByRole('combobox', { name: 'Part of the rocket to track' }).children];
    expect(options.map((o) => o.textContent)).toEqual(['Sustainer', 'Booster', 'Booster (3)']);
  });

  it('offers every camera, opening on the overview', () => {
    renderWithProviders(<FlightPath3D result={result} tree={tree} />);
    const camera = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Camera' });
    expect(camera.value).toBe('overview');
    expect([...camera.options].map((o) => o.text)).toEqual([
      'Overview',
      'Follow',
      'Launch pad',
      'Chase',
      'Onboard',
      'Director',
    ]);
    fireEvent.change(camera, { target: { value: 'director' } });
    expect(camera.value).toBe('director');
  });

  it('marks the events on the timeline and jumps to one', () => {
    const events = [
      { type: 'APOGEE', time: 2 },
      { type: 'SIM_WARN', time: 3 },
    ];
    renderWithProviders(<FlightPath3D result={{ ...result, events } as FlightResult} tree={tree} />);
    expect(document.querySelectorAll('[data-event-tick]')).toHaveLength(1);
    const jump = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Jump to event' });
    fireEvent.change(jump, { target: { value: jump.options[1]!.value } });
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('2.0 s');
  });

  it('switches the effects off, and keeps them off', () => {
    localStorage.clear();
    renderWithProviders(<FlightPath3D result={result} tree={tree} />);
    const effects = screen.getByRole('button', { name: 'Effects' });
    expect(effects.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(effects);
    expect(effects.getAttribute('aria-pressed')).toBe('false');
    expect(readSettings()['flightEffects']).toBe(false);
    localStorage.clear();
  });

  it('shows the wind the flight met, the arrow blowing the way it does', () => {
    const series = { ...result.series, Vw: [4, 4, 4, 4, 4], θw: Array(5).fill(Math.PI / 2) };
    renderWithProviders(<FlightPath3D result={{ ...result, series }} tree={tree} />);
    expect(screen.getByRole('img', { name: 'Wind speed 4.00 m/s, Wind direction 90°' })).toBeTruthy();
    expect(document.querySelector('[data-flight-wind]')!.getAttribute('transform')).toBe('rotate(270)');
  });

  it('keeps the compass, with no arrow, on a flight that recorded no wind', () => {
    renderWithProviders(<FlightPath3D result={result} tree={tree} />);
    expect(screen.getByRole('img', { name: 'N' })).toBeTruthy();
    expect(document.querySelector('[data-flight-wind]')).toBeNull();
  });

  it('speaks the playback position as a flight time, not a fraction', () => {
    renderWithProviders(<FlightPath3D result={result} tree={tree} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('0.0 s');
  });
});
