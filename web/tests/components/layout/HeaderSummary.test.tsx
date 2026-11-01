// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders, seedSettings } from '../../testing/renderWithProviders';
import { useWorkspaceStore, configOf } from '../../../src/state/store';
import { resultKey } from '../../../src/services/flight/simulations';
import type { StaticInfo } from '../../../src/engine/api';
import { HeaderSummary } from '../../../src/components/layout/HeaderSummary';
import { NO_VALUE } from '../../../src/i18n/noValue';

/**
 * The header's summary of the active simulation. What it must get right is the
 * apogee's honesty: a figure from a run the design has since moved past says
 * so, rather than passing for the current one.
 */
const st = () => useWorkspaceStore.getState();

const info = {
  length: 0.6,
  refDiameter: 0.05,
  massEmpty: 0.2,
  mass: 0.25,
  cgEmpty: 0.3,
  cg: 0.32,
  cp: 0.42,
  stabilityCalibers: 2,
  stabilityPercent: 16,
  cd: 0.5,
  cna: 9,
  pitchInertia: 0.01,
  rollInertia: 0.0001,
} as StaticInfo;

/** The active simulation flown to 275 m, keyed to the current design or not. */
const flown = (fresh: boolean) => {
  const sim = st().sims[0]!;
  const key = resultKey(st().tree, configOf(st().configs, sim), sim, st().simPrefs);
  act(() =>
    useWorkspaceStore.setState({
      sims: [{ ...sim, result: { summary: { maxAltitude: 275 } } as never, resultKey: fresh ? key : 'older design' }],
      activeId: sim.id,
    }),
  );
};

const strip = () => screen.getByRole('region', { name: 'Design summary' });
const noStrip = () => screen.queryByRole('region', { name: 'Design summary' });

/** jsdom has no matchMedia: answer every min-width query for this window width. */
const stubWidth = (width: number): void => {
  window.matchMedia = ((query: string) => ({
    matches: width >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

describe('HeaderSummary', () => {
  beforeEach(() => {
    stubWidth(1440);
    localStorage.clear();
    act(() => {
      st().resetWorkspace();
      useWorkspaceStore.setState({ info, simRuns: {}, simBusy: false });
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows nothing until the design has its static figures', () => {
    act(() => useWorkspaceStore.setState({ info: null }));
    renderWithProviders(<HeaderSummary />);
    expect(noStrip()).toBeNull();
  });

  it('is labeled and full by default on a wide window', () => {
    renderWithProviders(<HeaderSummary />);
    expect(strip().textContent).toContain('Configuration');
    expect(screen.getByRole('button', { name: /Run/ }).textContent).toContain('Run');
  });

  /**
   * jsdom lays nothing out, so the room is stubbed: 300px for the strip, which
   * the full strip (600px) overflows and the compact one (200px) fits, unless
   * the room is narrower still.
   */
  const stubRoom = (room: number) => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(room);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.textContent?.includes('Configuration') ? 600 : 200;
    });
  };

  it('steps down to the compact strip where the full one does not fit', () => {
    stubRoom(300);
    renderWithProviders(<HeaderSummary />);
    expect(strip().textContent).not.toContain('Configuration');
    expect(strip().textContent).toContain('2.00 cal');
  });

  it('gives way altogether where not even the compact strip fits', () => {
    stubRoom(150);
    renderWithProviders(<HeaderSummary />);
    expect(noStrip()).toBeNull();
  });

  it('is compact on a wide window when set to compact: stability, apogee and an icon Run', () => {
    seedSettings({ headerSummary: 'compact' });
    renderWithProviders(<HeaderSummary />);
    expect(strip().textContent).not.toContain('Configuration');
    expect(screen.getByRole('button', { name: 'Run' })).toBeTruthy();
  });

  it('shows nothing when set to off, or below 1280px', () => {
    seedSettings({ headerSummary: 'off' });
    const { unmount } = renderWithProviders(<HeaderSummary />);
    expect(noStrip()).toBeNull();
    unmount();
    localStorage.clear();
    stubWidth(1200);
    renderWithProviders(<HeaderSummary />);
    expect(noStrip()).toBeNull();
  });

  it('reads the stability with its verdict, the loaded mass and no apogee before a run', () => {
    renderWithProviders(<HeaderSummary />);
    expect(strip().textContent).toContain('2.00 cal');
    expect(strip().textContent).toContain('(Stable)');
    expect(strip().textContent).toContain('250');
    expect(strip().textContent).toContain(NO_VALUE);
  });

  it('shows a current apogee plainly, and opens that flight on Results', () => {
    flown(true);
    renderWithProviders(<HeaderSummary />);
    const apogee = screen.getByRole('button', { name: /275/ });
    expect(apogee.textContent).not.toContain('Outdated');
    fireEvent.click(apogee);
    expect(st().tab).toBe('results');
    expect(st().resultSimId).toBe(st().sims[0]!.id);
  });

  it('marks an apogee flown on an earlier design as outdated', () => {
    flown(false);
    renderWithProviders(<HeaderSummary />);
    expect(screen.getByRole('button', { name: /275/ }).textContent).toContain('Outdated');
  });

  it('runs the active simulation, and becomes Stop while a run is in the air', () => {
    const runSims = vi.fn(() => Promise.resolve({}));
    const cancelRun = vi.fn();
    act(() => useWorkspaceStore.setState({ runSims, cancelRun }));
    renderWithProviders(<HeaderSummary />);
    fireEvent.click(screen.getByRole('button', { name: /Run/ }));
    expect(runSims).toHaveBeenCalledWith([st().sims[0]!.id]);
    act(() => useWorkspaceStore.setState({ simBusy: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(cancelRun).toHaveBeenCalled();
  });
});
