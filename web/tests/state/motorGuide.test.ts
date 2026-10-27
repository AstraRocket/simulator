import { describe, it, expect, beforeEach, vi } from 'vitest';

// The guide flies through the same worker pool a normal batch does; stub it so
// each flight can be settled by hand and its payload inspected.
const simulateMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/engine/simClient', async (orig) => ({
  ...(await orig<typeof import('../../src/engine/simClient')>()),
  simulateInWorker: simulateMock,
}));
// And the spec builder, so a test controls the motor each flight seats.
const fetchSpecMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/motors/motorSpec', async (orig) => ({
  ...(await orig<typeof import('../../src/services/motors/motorSpec')>()),
  catalogMotorSpec: fetchSpecMock,
}));

import { useWorkspaceStore, isMotorGuideStale } from '../../src/state/store';
import { seatMotor } from '../testing/seatMotor';
import { C6 } from '../../src/engine/api';
import type { SimPrefs } from '../../src/services/flight/simulations';
import { PLUGGED_DELAY, type FlightResult, type MotorSpec } from '../../src/engine/openRocketEngine';
import type { SimPayload } from '../../src/engine/simProtocol';
import type { CatalogMotor } from '../../src/services/motors/motorDb';
import { findMounts } from '../../src/services/design/treeEdit';
import { configOf } from '../../src/state/store';

const st = () => useWorkspaceStore.getState();

const PREFS = {
  timeStep: 0.05,
  maxTime: 1200,
  maxAngleStep: (3 * Math.PI) / 180,
  randomSeed: null,
  deploymentSpeedWarn: 20,
  mainHighSpeedWarn: 30.48,
  mainLowSpeedWarn: 15.24,
  drogueLowSpeedWarn: 3.048,
} as SimPrefs;

beforeEach(() => st().setSimPrefs(PREFS));

const motor = (designation: string, delays?: string): CatalogMotor =>
  ({
    designation,
    manufacturer: 'Estes',
    class: 'C',
    diameter: 18,
    impulse: 10,
    burn: 1.9,
    mass: 24,
    // A bundled curve: the guide flies only motors whose curve is on the device.
    curves: [
      {
        src: 'cert',
        samples: [
          [0, 0],
          [1, 5],
          [1.9, 0],
        ],
      },
    ],
    ...(delays ? { delays } : {}),
  }) as CatalogMotor;

/** Charges either side of the optimum the flights below report (6.6 s). */
const CHARGED = motor('C6', '3,5,7');
const PLUGGED = motor('C6P', 'P');
const BARE = motor('C5');

/** A flight with an optimum delay and the rail-exit figures a row reads. */
const flight = (optimumDelay: number, apogee = 300) =>
  ({
    summary: {
      maxAltitude: apogee,
      maxVelocity: 90,
      maxAcceleration: 120,
      maxMachNumber: 0.27,
      timeToApogee: 8,
      flightTime: 60,
      groundHitVelocity: 5,
      launchRodVelocity: 14,
      deploymentVelocity: 4,
      optimumDelay,
    },
    events: [{ type: 'LAUNCHROD', time: 0.5 }],
    series: { time: [0, 1], stability: [2, 2], Twr: [8, 8] },
  }) as unknown as FlightResult;

describe('a motor guide', () => {
  let calls: { payload: SimPayload; settle: (r: FlightResult) => void; fail: (e: Error) => void }[];

  beforeEach(() => {
    calls = [];
    simulateMock.mockReset();
    simulateMock.mockImplementation(
      (payload: SimPayload) =>
        new Promise<FlightResult>((resolve, reject) => {
          calls.push({ payload, settle: resolve, fail: reject });
        }),
    );
    fetchSpecMock.mockReset();
    fetchSpecMock.mockImplementation(async (cat: CatalogMotor, delay: number): Promise<MotorSpec> => ({
      ...C6,
      designation: cat.designation,
      ejectionDelay: delay,
    }));
    while (st().sims.length > 1) st().deleteSim(st().sims[st().sims.length - 1]!.id);
    useWorkspaceStore.setState({
      sims: st().sims.map((x) => ({ ...x, result: null })),
      motorGuide: null,
      motorGuideRun: null,
      err: null,
    });
    seatMotor(st().sims[0]!.name, C6);
  });

  const simId = () => st().sims[0]!.id;
  const mountId = () => findMounts(st().tree)[0]!.id as string;
  const start = (motors: CatalogMotor[]) => st().runMotorGuide(simId(), mountId(), motors);
  /** The flights submitted so far, once every candidate's curve lookup has settled. */
  const flights = async (n: number) => vi.waitFor(() => expect(calls).toHaveLength(n));
  const seated = (c: (typeof calls)[number]) => c.payload.config.motors[mountId()]!.spec;

  it('flies each candidate in the chosen mount, at its probe delay', async () => {
    const done = start([CHARGED, PLUGGED, BARE]);
    await flights(3);
    expect(st().motorGuideRun).toEqual({ simId: simId(), done: 0, total: 3 });
    // The middle charge, plugged for a plugged-only motor, and the picker's
    // default for one with no delay data.
    expect(calls.map((c) => [seated(c).designation, seated(c).ejectionDelay])).toEqual([
      ['C6', 5],
      ['C6P', PLUGGED_DELAY],
      ['C5', 3],
    ]);
    calls.forEach((c) => c.settle(flight(6.6)));
    await flights(4);
    calls[3]!.settle(flight(6.6));
    await done;
    expect(st().motorGuide?.rows).toHaveLength(3);
    expect(st().motorGuideRun).toBeNull();
  });

  /**
   * The optimum comes from a probe with no deployment, so it does not depend on
   * the charge flown; the deployment speed does. A row is the flight at the
   * charge the flier would actually pick.
   */
  it('flies a motor again at its nearest charge when that differs from the probe', async () => {
    const done = start([CHARGED]);
    await flights(1);
    calls[0]!.settle(flight(6.6, 280));
    await flights(2);
    expect(seated(calls[1]!).ejectionDelay).toBe(7);
    calls[1]!.settle(flight(6.6, 281));
    await done;
    const row = st().motorGuide!.rows[0]!;
    expect(row).toMatchObject({ delay: 7, apogee: 281, optimumDelay: 6.6, railMargin: 2, railTwr: 8 });
  });

  it('takes the shorter of two equally near charges', async () => {
    const done = start([CHARGED]);
    await flights(1);
    calls[0]!.settle(flight(4));
    await flights(2);
    expect(seated(calls[1]!).ejectionDelay).toBe(3);
    calls[1]!.settle(flight(4));
    await done;
  });

  it('flies a motor once when its probe charge is already the nearest', async () => {
    const done = start([CHARGED]);
    await flights(1);
    calls[0]!.settle(flight(5.2));
    await done;
    expect(calls).toHaveLength(1);
    expect(st().motorGuide!.rows[0]!.delay).toBe(5);
  });

  /** Every other mount, and the row's own configuration, stay as they are. */
  it('flies throwaway configurations and leaves the workspace alone', async () => {
    const configsBefore = st().configs;
    const own = configOf(st().configs, st().sims[0]!);
    const done = start([BARE, PLUGGED]);
    await flights(2);
    for (const c of calls) {
      expect(c.payload.config.id).toBe(own.id);
      expect(c.payload.config).not.toBe(own);
    }
    calls.forEach((c) => c.settle(flight(5)));
    await done;
    expect(st().configs).toBe(configsBefore);
    expect(st().sims[0]!.result).toBeNull();
  });

  /**
   * A motor with no curve on the device would be looked up on thrustcurve.org
   * by the picker. The guide never does: it lists the motor as not flown.
   */
  it('never fetches a curve, naming a motor that has none as not flown', async () => {
    const curveless = { ...motor('D12'), curves: undefined } as CatalogMotor;
    const done = start([curveless, BARE]);
    await flights(1);
    calls[0]!.settle(flight(5));
    await done;
    expect(fetchSpecMock.mock.calls.map(([m]) => (m as CatalogMotor).designation)).toEqual(['C5']);
    expect(st().motorGuide!.rows.map((r) => r.motor.designation)).toEqual(['C5']);
    expect(st().motorGuide!.failed.map((f) => f.motor.designation)).toEqual(['D12']);
  });

  it('flies an imported motor, whose curve is on the device', async () => {
    const imported = { ...motor('E9'), curves: undefined, custom: true, id: 'e9' } as CatalogMotor;
    const done = start([imported]);
    await flights(1);
    calls[0]!.settle(flight(5));
    await done;
    expect(st().motorGuide!.rows).toHaveLength(1);
  });

  it('pins one turbulence seed across every flight', async () => {
    const done = start([BARE, PLUGGED]);
    await flights(2);
    expect(new Set(calls.map((c) => c.payload.options.randomSeed)).size).toBe(1);
    calls.forEach((c) => c.settle(flight(5)));
    await done;
  });

  it('lists a candidate that could not be flown, and keeps the rest', async () => {
    fetchSpecMock.mockImplementationOnce(async () => {
      throw new Error('no curve');
    });
    const done = start([BARE, PLUGGED]);
    await flights(1);
    calls[0]!.settle(flight(5));
    await done;
    expect(st().motorGuide!.rows.map((r) => r.motor.designation)).toEqual(['C6P']);
    expect(st().motorGuide!.failed).toEqual([expect.objectContaining({ reason: 'no curve' })]);
  });

  /**
   * A motor that makes the rocket high power tightens the launcher angle the
   * codes allow, so a candidate is refused on its own, the way a single run of
   * it would be, rather than flown or allowed to refuse the whole guide.
   */
  it('refuses a candidate a single run of it would refuse', async () => {
    st().patchActiveLaunch({ launchRodAngleDeg: 25 });
    fetchSpecMock.mockImplementation(async (cat: CatalogMotor, delay: number) => ({
      ...C6,
      designation: cat.designation,
      ejectionDelay: delay,
      // Twenty times a C6 is past 160 N·s: a high power motor.
      thrusts: cat === PLUGGED ? C6.thrusts.map((f) => f * 20) : C6.thrusts,
    }));
    const done = start([BARE, PLUGGED]);
    await flights(1);
    expect(seated(calls[0]!).designation).toBe('C5');
    calls[0]!.settle(flight(5));
    await done;
    expect(st().motorGuide!.rows.map((r) => r.motor.designation)).toEqual(['C5']);
    expect(st().motorGuide!.failed.map((f) => f.motor.designation)).toEqual(['C6P']);
  });

  /** Unlike a drift sweep's region, each row stands on its own. */
  it('keeps the rows already flown when canceled, and says it is partial', async () => {
    const done = start([BARE, PLUGGED]);
    await flights(2);
    calls[0]!.settle(flight(5));
    await vi.waitFor(() => expect(st().motorGuideRun?.done).toBe(1));
    st().cancelMotorGuide();
    calls[1]!.fail(new Error('canceled'));
    await done;
    expect(st().motorGuide).toMatchObject({ partial: true, asked: 2 });
    expect(st().motorGuide!.rows).toHaveLength(1);
    expect(st().motorGuide!.failed).toEqual([]);
  });

  it('keeps nothing flown against a design that changed mid-flight', async () => {
    const done = start([BARE]);
    await flights(1);
    useWorkspaceStore.setState({ tree: { ...st().tree } });
    calls[0]!.settle(flight(5));
    await done;
    expect(st().motorGuide).toBeNull();
  });

  describe('keeping a row', () => {
    const flyOne = async () => {
      const done = start([BARE]);
      await flights(1);
      calls[0]!.settle(flight(5));
      await done;
      return st().motorGuide!.rows[0]!;
    };

    it('makes a configuration flying that motor and a simulation of it, active', async () => {
      const row = await flyOne();
      const src = st().sims[0]!;
      const id = st().promoteGuideRow(row.key);
      expect(id).toBeTruthy();
      expect(st().sims).toHaveLength(2);
      const made = st().sims[1]!;
      expect(made.id).toBe(id);
      expect(st().activeId).toBe(id);
      expect(made.launch).toEqual(src.launch);
      const cfg = configOf(st().configs, made);
      expect(cfg.id).not.toBe(src.configId);
      expect(cfg.name).toBeNull();
      expect(cfg.motors[mountId()]!.spec).toBe(row.spec);
    });

    it('is one undo step', async () => {
      const row = await flyOne();
      const before = st().sims.length;
      st().promoteGuideRow(row.key);
      st().undo();
      expect(st().sims).toHaveLength(before);
    });

    it('refuses a row from a guide the design has moved on from', async () => {
      const row = await flyOne();
      useWorkspaceStore.setState({ tree: { ...st().tree } });
      expect(isMotorGuideStale(st(), st().motorGuide!)).toBe(true);
      expect(st().promoteGuideRow(row.key)).toBeNull();
      expect(st().sims).toHaveLength(1);
    });
  });
});
