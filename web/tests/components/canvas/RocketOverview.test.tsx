// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { useWorkspaceStore } from '../../../src/state/store';
import type { StaticInfo } from '../../../src/engine/api';
import { RocketOverview } from '../../../src/components/canvas/RocketOverview';

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

const card = () => screen.getByRole('region', { name: 'Design summary' });

describe('RocketOverview', () => {
  beforeEach(() => {
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

  it('reads the stability with its verdict and the loaded mass', () => {
    renderWithProviders(<RocketOverview info={info} />);
    expect(card().textContent).toContain('2.00 cal');
    expect(card().textContent).toContain('(Stable)');
    expect(card().textContent).toContain('250');
  });

  it('opens the Sketch half from the drawing', () => {
    act(() => useWorkspaceStore.setState({ tab: 'design', designPane: 'stats' }));
    renderWithProviders(<RocketOverview info={info} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open the sketch' }));
    expect(st().designPane).toBe('sketch');
  });

  it('points the active simulation at the configuration picked', () => {
    const [first] = st().configs;
    act(() => useWorkspaceStore.setState({ configs: [first!, { ...first!, id: 'second' }] }));
    renderWithProviders(<RocketOverview info={info} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'second' } });
    expect(st().sims[0]!.configId).toBe('second');
  });

  it('runs the active simulation', () => {
    const runSims = vi.fn(() => Promise.resolve({}));
    act(() => useWorkspaceStore.setState({ runSims }));
    renderWithProviders(<RocketOverview info={info} />);
    fireEvent.click(screen.getByRole('button', { name: /Run/ }));
    expect(runSims).toHaveBeenCalledWith([st().sims[0]!.id]);
  });
});
