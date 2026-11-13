import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { MAX_ROD_ANGLE_RAD } from '../../../src/services/flight/safetyLimits';
import {
  simConditions,
  newSimulation,
  nextFreeName,
  resultKey,
  type SimPrefs,
} from '../../../src/services/flight/simulations';
import { newFlightConfig } from '../../../src/services/flight/flightConfigs';
import type { CompleteLaunch } from '../../../src/services/flight/requiredLaunch';
import { DEFAULT_HEADING_DEG } from '../../../src/services/flight/windLevels';

const base: CompleteLaunch = {
  launchRodLengthM: 1,
  launchRodAngleDeg: 0,
  launchRodDirectionDeg: 90,
  windAverage: 2,
  windStdDev: 0.5,
  windDirectionDeg: 45,
  launchAltitudeM: 100,
  latitudeDeg: 40,
  longitudeDeg: -105,
  temperatureC: 15,
  pressureHPa: 1013,
};

const deg2rad = (d: number) => (d * Math.PI) / 180;

const PREFS: SimPrefs = {
  timeStep: 0.01,
  maxTime: 60,
  maxAngleStep: deg2rad(3),
  stepper: 'rk4',
  randomSeed: null,
  deploymentSpeedWarn: 20,
  mainHighSpeedWarn: 30.48,
  mainLowSpeedWarn: 15.24,
  drogueLowSpeedWarn: 3.048,
  guideAwareRodClearance: false,
  railExitVelocityMin: 15,
};

describe('simConditions', () => {
  it('converts angles to radians and C→K, hPa→Pa', () => {
    const c = simConditions({ ...base, launchRodAngleDeg: 30 });
    expect(c.launchRodAngle).toBeCloseTo(deg2rad(30), 9);
    expect(c.launchRodDirection).toBeCloseTo(deg2rad(90), 9);
    expect(c.windDirection).toBeCloseTo(deg2rad(45), 9);
    expect(c.temperature).toBeCloseTo(288.15, 6);
    expect(c.pressure).toBeCloseTo(101300, 6);
    expect(c.series).toBe('full');
  });

  it('leaves temperature/pressure undefined for the ISA standard atmosphere (null)', () => {
    const c = simConditions({ ...base, temperatureC: null, pressureHPa: null });
    expect(c.temperature).toBeUndefined();
    expect(c.pressure).toBeUndefined();
  });

  it('aims the rod into the wind when launchIntoWind is set', () => {
    const c = simConditions({ ...base, launchIntoWind: true, windDirectionDeg: 200, launchRodDirectionDeg: 10 });
    expect(c.launchRodDirection).toBeCloseTo(deg2rad(200), 9); // wind heading, not rod dir
  });

  it('prefers the surface wind level heading when aiming into the wind', () => {
    const c = simConditions({
      ...base,
      launchIntoWind: true,
      windDirectionDeg: 200,
      windLevels: [{ altitudeM: 0, speed: 3, directionDeg: 123, stddev: 0 }],
    });
    expect(c.launchRodDirection).toBeCloseTo(deg2rad(123), 9);
  });

  it('defaults a missing rod direction to 90°', () => {
    const { launchRodDirectionDeg: _omit, ...noDir } = base;
    const c = simConditions(noDir as CompleteLaunch);
    expect(c.launchRodDirection).toBeCloseTo(deg2rad(90), 9);
  });

  it('maps multilevel wind to radians per level', () => {
    const c = simConditions({
      ...base,
      windLevels: [
        { altitudeM: 0, speed: 2, directionDeg: 90, stddev: 0.1 },
        { altitudeM: 500, speed: 5, directionDeg: 180, stddev: 0.2 },
      ],
    });
    expect(c.windLevels).toHaveLength(2);
    expect(c.windLevels![1]).toMatchObject({ altitude: 500, speed: 5, stddev: 0.2 });
    expect(c.windLevels![1]!.direction).toBeCloseTo(deg2rad(180), 9);
  });

  it('passes sim prefs through, minting a fresh seed when none is pinned', () => {
    const c = simConditions(base, PREFS);
    expect(c.timeStep).toBe(0.01);
    expect(c.maxTime).toBe(60);

    // The bridge defaults an omitted seed to 42, making every turbulent run identical.
    expect(c.randomSeed).toEqual(expect.any(Number));
    expect(Number.isInteger(c.randomSeed)).toBe(true);
    expect(c.randomSeed).toBeGreaterThanOrEqual(-(2 ** 31));
    expect(c.randomSeed).toBeLessThan(2 ** 31);

    const seeds = new Set(Array.from({ length: 20 }, () => simConditions(base, PREFS).randomSeed));
    expect(seeds.size).toBeGreaterThan(1);
  });

  // Left out, the kernel warns at its hard-coded 20 m/s regardless of the setting.
  it('passes the deployment-warning thresholds to the engine', () => {
    const c = simConditions(base, {
      ...PREFS,
      deploymentSpeedWarn: 25,
      mainHighSpeedWarn: 40,
      mainLowSpeedWarn: 10,
      drogueLowSpeedWarn: 4,
    });
    expect(c.recoverySpeedWarn).toBe(25);
    expect(c.mainHighSpeedWarn).toBe(40);
    expect(c.mainLowSpeedWarn).toBe(10);
    // Upstream comments out the reader; PATCH(drogue-low-speed) enables it.
    expect(c.drogueLowSpeedWarn).toBe(4);
  });

  it('honors a pinned seed, so a run can be reproduced exactly', () => {
    const seeded = simConditions(base, { ...PREFS, randomSeed: 42 });
    expect(seeded.randomSeed).toBe(42);
    expect(simConditions(base, { ...PREFS, randomSeed: 42 }).randomSeed).toBe(42);
  });
});

describe('launch into the wind with a multilevel profile', () => {
  const topDown = [
    { altitudeM: 3000, speed: 15, directionDeg: 270, stddev: 0 },
    { altitudeM: 0, speed: 2, directionDeg: 135, stddev: 0 },
  ];

  it('aims the rod at the SURFACE level (lowest altitude), not windLevels[0]', () => {
    const c = simConditions({ ...base, launchAltitudeM: 0, launchIntoWind: true, windLevels: topDown });
    expect(c.launchRodDirection).toBeCloseTo(deg2rad(135), 9);
  });

  it('aims by the wind interpolated at the pad altitude, as getLaunchRodDirection does', () => {
    const sounding = [
      { altitudeM: 0, speed: 6, directionDeg: 0, stddev: 0 },
      { altitudeM: 2000, speed: 6, directionDeg: 90, stddev: 0 },
    ];
    const c = simConditions({ ...base, launchAltitudeM: 1000, launchIntoWind: true, windLevels: sounding });
    expect(c.launchRodDirection).toBeCloseTo(deg2rad(45), 9);
  });

  it('falls back to the single wind heading, then the default, with no profile', () => {
    expect(simConditions({ ...base, launchIntoWind: true }).launchRodDirection).toBeCloseTo(deg2rad(45), 9);
    const c = simConditions({ ...base, launchIntoWind: true, windDirectionDeg: undefined });
    expect(c.launchRodDirection).toBeCloseTo(deg2rad(DEFAULT_HEADING_DEG), 9);
    expect(DEFAULT_HEADING_DEG).toBe(90);
  });
});

describe('a negative rod angle', () => {
  const java = (rel: string) => readFileSync(new URL(`../../../../engine-java/src/${rel}`, import.meta.url), 'utf8');

  it('is sent as its radians, inside the range desktop admits', () => {
    const options = java('java/info/openrocket/core/simulation/SimulationOptions.java');
    const m = options.match(/MAX_LAUNCH_ROD_ANGLE\s*=\s*Math\.PI\s*\/\s*(\d+)\s*;/);
    if (!m) throw new Error('SimulationOptions.java declares no MAX_LAUNCH_ROD_ANGLE');
    const limit = Math.PI / Number(m[1]);
    expect(options).toContain('MathUtil.clamp(launchRodAngle, -MAX_LAUNCH_ROD_ANGLE, MAX_LAUNCH_ROD_ANGLE)');
    expect(java('java/info/openrocket/core/simulation/SimulationConditions.java')).toMatch(
      /setLaunchRodAngle\(double launchRodAngle\) \{\s*this\.launchRodAngle = launchRodAngle;/,
    );
    expect(java('api/java/api/OpenRocketEngine.java')).toContain(
      'conditions.setLaunchRodAngle(JsonLite.dbl(o, "rodAngle", 0))',
    );
    expect(java('java/info/openrocket/core/simulation/AbstractRKSimulationStepper.java')).toContain(
      'Math.sin(sim.getLaunchRodAngle())',
    );

    const c = simConditions({ ...base, launchIntoWind: true, launchRodAngleDeg: -5 });
    expect(c.launchRodAngle).toBeCloseTo(deg2rad(-5), 12);
    expect(c.launchRodAngle).toBeGreaterThan(-limit);
    expect(MAX_ROD_ANGLE_RAD.model).toBeLessThanOrEqual(limit);
  });
});

// SimulationOptions clamps the step to 1-20 degrees; SimulationConditions, which the bridge sets, does not.
describe('simConditions max angle step', () => {
  it('flies the step inside the kernel range', () => {
    expect(simConditions(base, { ...PREFS, maxAngleStep: deg2rad(0.05) }).maxAngleStep).toBeCloseTo(deg2rad(1));
    expect(simConditions(base, { ...PREFS, maxAngleStep: deg2rad(30) }).maxAngleStep).toBeCloseTo(deg2rad(20));
    expect(simConditions(base, PREFS).maxAngleStep).toBeCloseTo(deg2rad(3));
  });
});

describe('a profile kept under the Average model', () => {
  const kept = [
    { altitudeM: 0, speed: 3, directionDeg: 90, stddev: 0.3 },
    { altitudeM: 500, speed: 6, directionDeg: 120, stddev: 1.2 },
  ];
  const seeded = { ...PREFS, randomSeed: 7 };

  it('is not flown', () => {
    expect(simConditions({ ...base, keptWindLevels: kept }, seeded)).toEqual(simConditions(base, seeded));
  });

  it('does not age a result', () => {
    const tree = { components: [{ type: 'nosecone', id: 'n', length: 0.1 }] } as never;
    const config = newFlightConfig();
    const sim = (launch: CompleteLaunch) => newSimulation('A', config.id, launch);
    expect(resultKey(tree, config, sim({ ...base, keptWindLevels: kept }), PREFS)).toBe(
      resultKey(tree, config, sim(base), PREFS),
    );
  });
});

describe('nextFreeName', () => {
  it('keeps a free name and numbers a taken one from 2', () => {
    expect(nextFreeName('Copy', ['A'])).toBe('Copy');
    expect(nextFreeName('Copy', ['Copy'])).toBe('Copy 2');
    expect(nextFreeName('Copy', ['Copy', 'Copy 2', 'Copy 3'])).toBe('Copy 4');
  });
});
