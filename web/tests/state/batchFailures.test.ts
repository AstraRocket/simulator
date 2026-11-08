import { describe, it, expect, beforeEach, vi } from 'vitest';

const simulateMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/engine/simClient', async (orig) => ({
  ...(await orig<typeof import('../../src/engine/simClient')>()),
  simulateInWorker: simulateMock,
}));

import { useWorkspaceStore } from '../../src/state/store';
import i18n from '../../src/i18n';
import { KeyedError } from '../../src/i18n/keyedError';
import { seatMotor, CURVELESS } from '../testing/seatMotor';
import type { FlightResult } from '../../src/engine/openRocketEngine';
import type { SimPrefs } from '../../src/services/flight/simulations';

const st = () => useWorkspaceStore.getState();

const PREFS = {
  timeStep: 0.05,
  maxTime: 1200,
  maxAngleStep: (3 * Math.PI) / 180,
  randomSeed: 1,
  deploymentSpeedWarn: 20,
  mainHighSpeedWarn: 30.48,
  mainLowSpeedWarn: 15.24,
  drogueLowSpeedWarn: 3.048,
} as SimPrefs;

beforeEach(() => st().setSimPrefs(PREFS));

const RESULT = { summary: { maxAltitude: 100 }, events: [], series: {} } as unknown as FlightResult;

describe('a batch where rows FAIL', () => {
  beforeEach(() => {
    simulateMock.mockReset();

    st().setSimsSelected([]);
    while (st().sims.length > 1) st().deleteSim(st().sims[st().sims.length - 1]!.id);
    st().renameSim(st().sims[0]!.id, 'Alpha');
    st().addSim();
    st().renameSim(st().sims[1]!.id, 'Bravo');
    st().addSim();
    st().renameSim(st().sims[2]!.id, 'Charlie');
    st().commitEdit();

    useWorkspaceStore.setState({ err: null });
  });

  it('names EVERY failed row, not just whichever finished last', async () => {
    simulateMock.mockImplementation(() => Promise.reject(new Error('kernel exploded')));

    await st().runSims(st().sims.map((x) => x.id));

    const err = st().err ?? '';
    for (const name of ['Alpha', 'Bravo', 'Charlie']) expect(err).toContain(name);
    expect(err.match(/kernel exploded/g) ?? []).toHaveLength(3);
  });

  it('does not let the skip line erase the failures', async () => {
    seatMotor('Charlie', CURVELESS);
    // The payload has no row identity; call order is target order minus skips.
    simulateMock.mockRejectedValueOnce(new Error('boom alpha')).mockResolvedValue(RESULT);

    await st().runSims(st().sims.map((x) => x.id));

    const err = st().err ?? '';
    expect(err).toContain('Alpha');
    expect(err).toContain('boom alpha');
    expect(err).toContain('Charlie');
  });

  it("gives a keyed failure from the worker in the app's language", async () => {
    await i18n.changeLanguage('de');
    try {
      simulateMock.mockImplementation(() =>
        Promise.reject(new KeyedError('errors.motorCurve.noMass', { motor: 'F67' })),
      );
      await st().runSims([st().sims[0]!.id]);
      const err = st().err ?? '';
      expect(err).toContain(i18n.t('errors.motorCurve.noMass', { motor: 'F67' }));
      expect(err).not.toContain('thrust curve');
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('says nothing when every row flies', async () => {
    simulateMock.mockResolvedValue(RESULT);
    await st().runSims(st().sims.map((x) => x.id));
    expect(st().err).toBeNull();
  });
});
