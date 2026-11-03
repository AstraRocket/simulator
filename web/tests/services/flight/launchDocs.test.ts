import { describe, it, expect } from 'vitest';
import { certLevel, launchDocs, type LaunchDocs } from '../../../src/services/flight/launchDocs';
import type { FlightConfig } from '../../../src/services/flight/flightConfigs';
import type { LaunchConditions } from '../../../src/services/design/orkTree';
import { PLUGGED_DELAY } from '../../../src/engine/openRocketEngine';
import type { FlightSummary, MotorSpec, RocketTree, StaticInfo } from '../../../src/engine/openRocketEngine';

/** A flat 1 s burn of `thrust` N: that many N·s. */
const motor = (thrust: number, ejectionDelay: number): MotorSpec =>
  ({
    designation: 'H128',
    code: 'H128W',
    manufacturer: 'AeroTech',
    diameter: 0.029,
    length: 0.194,
    times: [0, 0.01, 1, 1.01],
    thrusts: [0, thrust, thrust, 0],
    masses: [0.2, 0.2, 0.1, 0.1],
    cgX: 0.1,
    ejectionDelay,
  }) as MotorSpec;

const tree = {
  name: 'R',
  components: [
    {
      id: 'sus',
      type: 'stage',
      name: 'Sustainer',
      children: [
        {
          id: 'body',
          type: 'bodytube',
          name: 'Body',
          length: 0.6,
          outerRadius: 0.03,
          thickness: 0.001,
          motorMount: true,
          children: [
            {
              id: 'chute',
              type: 'parachute',
              name: 'Main chute',
              diameter: 0.9,
              deployEvent: 'altitude',
              deployAltitude: 150,
              length: 0.05,
            },
          ],
        },
      ],
    },
  ],
} as unknown as RocketTree;

const info = { length: 0.9, refDiameter: 0.06, mass: 1.2, cg: 0.5, cp: 0.62, stabilityCalibers: 2 } as StaticInfo;
const launch = { launchRodLengthM: 1.8, launchRodAngleDeg: 5, windAverage: 3 } as LaunchConditions;
const flight = {
  maxAltitude: 410,
  maxVelocity: 95,
  maxMachNumber: 0.28,
  timeToApogee: 9.5,
  flightTime: 60,
  groundHitVelocity: 5,
  launchRodVelocity: 17,
  deploymentVelocity: 12,
  optimumDelay: 7.6,
} as FlightSummary;

const docsFor = (spec: MotorSpec, over: Partial<FlightConfig> = {}): LaunchDocs =>
  launchDocs({
    designName: 'Rocket',
    simName: 'Sim 1',
    configName: 'H128W-8',
    outdated: false,
    tree,
    config: { id: 'c', motors: { body: { spec } }, ...over } as unknown as FlightConfig,
    info,
    flight,
    launch,
  });

describe('the certification a flight needs', () => {
  it('follows the total impulse on the pad', () => {
    expect([100, 160, 161, 640, 641, 5120, 5121].map(certLevel)).toEqual([0, 0, 1, 1, 2, 2, 3]);
  });
});

describe('the launch documents', () => {
  it('reads the motor, its delay and its class, and the certification it needs', () => {
    const docs = docsFor(motor(300, 8));
    expect(docs.motors.map((m) => [m.stageName, m.delayS, m.impulseClass, m.count])).toEqual([
      ['Sustainer', 8, 'H', 1],
    ]);
    expect(docs.certLevel).toBe(1);
  });

  it('calls a motor flown plugged plugged', () => {
    expect(docsFor(motor(300, PLUGGED_DELAY)).motors[0]!.delayS).toBeNull();
  });

  it('reads when each device opens on this flight, the configuration over the design', () => {
    expect(docsFor(motor(300, 8)).devices.map((d) => [d.deployEvent, d.deployAltitudeM, d.diameterM])).toEqual([
      ['altitude', 150, 0.9],
    ]);
    const over = docsFor(motor(300, 8), { deployments: { chute: { deployAltitude: 200 } } } as Partial<FlightConfig>);
    expect(over.devices[0]!.deployAltitudeM).toBe(200);
  });

  it('leaves out a stage the configuration grounds', () => {
    const docs = docsFor(motor(300, 8), { grounded: ['sus'] });
    expect(docs.motors).toEqual([]);
    expect(docs.devices).toEqual([]);
  });
});
