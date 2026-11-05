// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import { useWorkspaceStore } from '../../../src/state/store';
import { SimSummary } from '../../../src/components/sim/SimSummary';
import { renderWithProviders, seedSettings } from '../../testing/renderWithProviders';
import { fmtNum, ladderDigits } from '../../../src/i18n/format';
import type { FlightResult, RocketTree } from '../../../src/engine/openRocketEngine';

const sim = (Px: (number | null)[], Py: (number | null)[]) =>
  ({
    summary: {
      maxAltitude: 100,
      maxVelocity: 50,
      maxAcceleration: 100,
      maxMachNumber: 0.2,
      timeToApogee: 4,
      flightTime: 30,
      groundHitVelocity: 5,
      launchRodVelocity: 20,
      deploymentVelocity: null,
      optimumDelay: null,
    },
    events: [],
    series: { time: [0, 1, 2], altitude: [0, 100, 0], Px, Py },
  }) as unknown as FlightResult;

const tile = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

describe('SimSummary downrange', () => {
  // East and north come from the same last finite sample, as groundTrack.landingPoint reads it.
  it('reads the landing from one sample, the way the ground track does', () => {
    renderWithProviders(<SimSummary sim={sim([0, 30, 40], [0, 40, null])} />);
    expect(tile('Downrange')).toBe('50.0');
  });
});

describe('SimSummary figure precision', () => {
  it('formats each figure the way the simulations table does', () => {
    const flown = sim([0, 0, 0], [0, 0, 0]);
    Object.assign(flown.summary, {
      groundHitVelocity: 6.2,
      launchRodVelocity: 20,
      maxAcceleration: 85,
      maxVelocity: 50,
    });
    renderWithProviders(<SimSummary sim={flown} />);
    const ladder = (v: number) => fmtNum(v, ladderDigits(v));
    expect(tile('Landing')).toBe(ladder(6.2));
    expect(tile('Rod exit')).toBe(ladder(20));
    expect(tile('Max accel')).toBe(ladder(85));
    expect(tile('Max speed')).toBe(ladder(50));
  });
});

describe('SimSummary names the launcher after the design', () => {
  const before = useWorkspaceStore.getState().tree;
  afterEach(() => act(() => useWorkspaceStore.setState({ tree: before })));

  const guided = (type: string) =>
    ({
      components: [{ type: 'stage', children: [{ type: 'bodytube', children: [{ type }, { type }] }] }],
    }) as unknown as RocketTree;

  it('says rail for a design on rail buttons', () => {
    act(() => useWorkspaceStore.setState({ tree: guided('railbutton') }));
    renderWithProviders(<SimSummary sim={sim([0, 0, 0], [0, 0, 0])} />);
    expect(screen.getByText('Rail exit')).toBeTruthy();
    expect(screen.queryByText('Rod exit')).toBeNull();
  });

  it('says rod for a design on a launch lug', () => {
    act(() => useWorkspaceStore.setState({ tree: guided('launchlug') }));
    renderWithProviders(<SimSummary sim={sim([0, 0, 0], [0, 0, 0])} />);
    expect(screen.getByText('Rod exit')).toBeTruthy();
  });

  it('says launcher for a design with neither', () => {
    act(() => useWorkspaceStore.setState({ tree: { components: [] } as unknown as RocketTree }));
    renderWithProviders(<SimSummary sim={sim([0, 0, 0], [0, 0, 0])} />);
    expect(screen.getByText('Launcher exit')).toBeTruthy();
  });
});

describe('SimSummary verdicts', () => {
  const subOf = (label: RegExp) => screen.getByText(label).nextElementSibling?.nextElementSibling?.textContent;

  it('names a slow launcher exit and a fast deployment', () => {
    const flown = sim([0, 0, 0], [0, 0, 0]);
    Object.assign(flown.summary, { launchRodVelocity: 3, deploymentVelocity: 60 });
    renderWithProviders(<SimSummary sim={flown} />);
    expect(subOf(/exit$/)).toContain('Below minimum');
    expect(subOf(/^Deploy speed$/)).toContain('Too fast');
  });

  it('adds no word to a reading inside the limits', () => {
    const flown = sim([0, 0, 0], [0, 0, 0]);
    Object.assign(flown.summary, { launchRodVelocity: 30, deploymentVelocity: 2 });
    renderWithProviders(<SimSummary sim={flown} />);
    expect(subOf(/exit$/)).not.toContain('Below minimum');
    expect(subOf(/^Deploy speed$/)).not.toContain('Too fast');
  });
});

describe('SimSummary deployment threshold', () => {
  const before = useWorkspaceStore.getState();
  afterEach(() =>
    act(() => useWorkspaceStore.setState({ sims: before.sims, activeId: before.activeId, tree: before.tree })),
  );
  const subOf = (label: RegExp) => screen.getByText(label).nextElementSibling?.nextElementSibling?.textContent;

  const show = (flown: FlightResult, prefs?: Record<string, number>) =>
    act(() =>
      useWorkspaceStore.setState({
        sims: [{ id: 'x', name: 'X', configId: 'c', launch: {}, result: flown, prefs }],
        activeId: 'x',
        resultSimId: null,
      } as never),
    );

  it("reads the simulation's override, not the global", () => {
    const flown = sim([0, 0, 0], [0, 0, 0]);
    Object.assign(flown.summary, { deploymentVelocity: 15 });
    show(flown, { deploymentSpeedWarn: 10 });
    renderWithProviders(<SimSummary sim={flown} />);
    expect(subOf(/^Deploy speed$/)).toContain('Too fast');
  });

  it('takes the verdict from the kernel warnings when the flight has them', () => {
    // 25 m/s exceeds the single-deployment default, but a dual-deployment main is judged against its pair.
    const quiet = sim([0, 0, 0], [0, 0, 0]);
    Object.assign(quiet, { warnings: [] });
    Object.assign(quiet.summary, { deploymentVelocity: 25 });
    show(quiet);
    renderWithProviders(<SimSummary sim={quiet} />);
    expect(subOf(/^Deploy speed$/)).not.toContain('Too fast');
  });

  it('says a dual-deployment main opened too slow', () => {
    const slow = sim([0, 0, 0], [0, 0, 0]);
    // The message names its device the way `Message.addSourcesToMessageText` writes it.
    Object.assign(slow, {
      events: [{ type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 10, source: 'Main' }],
      warnings: [{ key: 'RECOVERY_MAIN_LOW_SPEED', message: '[Warning.RECOVERY_MAIN_LOW_SPEED] (5 m/s):  "Main"' }],
    });
    Object.assign(slow.summary, { deploymentVelocity: 5 });
    show(slow);
    renderWithProviders(<SimSummary sim={slow} />);
    expect(subOf(/^Deploy speed$/)).toContain('Too slow');
  });
  it('does not take a warning by a name two recovery devices share', () => {
    const chute = '[Parachute.Parachute]';
    act(() =>
      useWorkspaceStore.setState({
        tree: {
          components: [
            { id: 's', type: 'stage', children: [{ id: 'sc', type: 'parachute' }] },
            { id: 'b', type: 'stage', children: [{ id: 'bc', type: 'parachute' }] },
          ],
        } as unknown as RocketTree,
      }),
    );
    const stored = sim([0, 0, 0], [0, 0, 0]);
    Object.assign(stored, {
      events: [{ type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 10, source: chute }],
      warnings: [{ key: 'HighSpeedDeployment', message: `[Warning.HighSpeedDeployment] (40 m/s):  "${chute}"` }],
    });
    Object.assign(stored.summary, { deploymentVelocity: 5 });
    show(stored);
    renderWithProviders(<SimSummary sim={stored} />);
    expect(subOf(/^Deploy speed$/)).not.toContain('Too fast');
  });
});

describe('SimSummary max q·α', () => {
  afterEach(() => localStorage.clear());

  it('follows the Max q unit and the angle unit', () => {
    seedSettings({ unitOverrides: { 'sim.maxQ': 'psi' } });
    const flown = sim([0, 0, 0], [0, 0, 0]);
    Object.assign(flown.series, {
      ρ: [1.2, 1.2, 1.2],
      Vs: [340, 340, 340],
      mach: [0, 0.5, 0],
      aoa: [0, 0.1, 0],
    });
    renderWithProviders(<SimSummary sim={flown} />);
    // q = ½·1.2·170² = 17,340 Pa, times 0.1 rad: 1,734 Pa·rad.
    const psiDeg = ((1734 / 6894.75729) * 180) / Math.PI;
    expect(tile('Max q·α')).toBe(fmtNum(psiDeg, 1));
    expect(screen.getByText('psi·°')).toBeTruthy();
  });
});

describe('SimSummary safety link', () => {
  it('is named by its words alone, the arrow hidden from screen readers', () => {
    seedSettings({ showSafetyCard: true });
    renderWithProviders(<SimSummary sim={sim([0, 1], [0, 1])} />);
    expect(screen.getByRole('button', { name: 'Read the safety notes' })).toBeTruthy();
  });
});
