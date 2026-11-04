import { describe, expect, it, vi } from 'vitest';
import { deploymentVerdict, lastDeployment } from '../../../src/components/sim/speedWarnings';
import { sharedDeviceNames } from '../../../src/services/flight/recoveryFlown';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';
import { loadEngine } from '../../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';
import { flyTwoStage, TWO_STAGE, WARN } from '../../testing/twoStageFlight';
import type { FlightResult } from '../../../src/engine/openRocketEngine';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

const TREE = {
  name: 'R',
  components: [
    {
      id: 'st',
      type: 'stage',
      name: 'Sustainer',
      children: [
        { id: 'n', type: 'nosecone', shape: 'ogive', length: 0.07, aftRadius: 0.013, thickness: 0.001 },
        {
          id: 'm',
          type: 'bodytube',
          length: 0.3,
          outerRadius: 0.013,
          thickness: 0.0005,
          motorMount: true,
          children: [
            {
              id: 'f',
              type: 'trapezoidfinset',
              finCount: 3,
              rootChord: 0.06,
              tipChord: 0.03,
              sweep: 0.03,
              height: 0.05,
              thickness: 0.003,
            },
            { id: 'chute', type: 'parachute', name: 'Main', diameter: 0.4, cd: 0.8 },
          ],
        },
      ],
    },
  ],
};

describe('deploymentVerdict', () => {
  it('takes a warning for a device of the branch, and ignores one for another stage’s device', async () => {
    const engine = await loadEngine();
    engine.reset();
    const h = engine.buildRocket(JSON.stringify(TREE));
    engine.setMotorById(h, 'm', 'C6', 0.018, 0.07, [0, 0.2, 1.8], [0, 14, 0], [0.024, 0.022, 0.012], 0.035, 3);
    const result = JSON.parse(
      engine.simulateJson(h, JSON.stringify({ launchRodLength: 1, randomSeed: 7, recoverySpeedWarn: 0.01 })),
    ) as FlightResult;
    const speed = result.summary.deploymentVelocity!;
    expect(speed).toBeGreaterThan(0.01);
    expect(result.warnings?.some((w) => w.message.includes('"Main"'))).toBe(true);

    expect(deployedSources(result.events)).toEqual(['Main']);
    const devices = lastDeployment(result.events);
    expect(deploymentVerdict(speed, result.warnings, 0.01, devices)).toBe('tooFast');
    expect(deploymentVerdict(speed, result.warnings, 0.01, [{ name: 'Booster chute' }])).toBeNull();
  });

  it('keeps a booster chute’s warning off the sustainer when neither chute is named', async () => {
    const result = await flyTwoStage();
    const [sustainer, booster] = result.branches!;
    expect(deployedSources(sustainer!.events)).toEqual(['[Parachute.Parachute]']);
    expect(deployedSources(booster!.events)).toEqual(['[Parachute.Parachute]']);
    const sDevices = lastDeployment(sustainer!.events);
    const bDevices = lastDeployment(booster!.events);
    const fast = result.warnings!.filter((w) => w.key === 'HighSpeedDeployment');
    expect(fast).toHaveLength(1);
    expect(fast[0]!.message).toContain('"[Parachute.Parachute]"');

    expect(deploymentVerdict(0, result.warnings, WARN, bDevices)).toBe('tooFast');
    expect(deploymentVerdict(0, result.warnings, WARN, sDevices)).toBeNull();
  });

  it('takes no verdict from an id-less warning whose name two chutes share', async () => {
    const result = await flyTwoStage();
    const stored = JSON.parse(
      JSON.stringify(result, (k, v) => (k === 'sourceId' || k === 'sourceIds' ? undefined : v)),
    ) as FlightResult;
    const [sustainer, booster] = stored.branches!;
    const shared = sharedDeviceNames(TWO_STAGE.components as unknown as ComponentNode[]);
    expect([...shared]).toEqual(['[Parachute.Parachute]']);
    expect(stored.warnings!.some((w) => w.key === 'HighSpeedDeployment')).toBe(true);
    expect(deploymentVerdict(0, stored.warnings, WARN, lastDeployment(sustainer!.events), shared)).toBeNull();
    expect(deploymentVerdict(0, stored.warnings, WARN, lastDeployment(booster!.events), shared)).toBeNull();
  });
});

describe('the last deployment', () => {
  const tree = () => {
    const t = JSON.parse(JSON.stringify(TREE)) as typeof TREE;
    const kids = t.components[0]!.children[1]!.children as Record<string, unknown>[];
    kids.splice(1, 1, {
      id: 'early',
      type: 'parachute',
      name: 'Early',
      diameter: 0.6,
      cd: 0.8,
      deployEvent: 'ejection',
    });
    kids.push({
      id: 'late',
      type: 'parachute',
      name: 'Late',
      diameter: 0.4,
      cd: 0.8,
      deployEvent: 'altitude',
      deployAltitude: 40,
    });
    return t;
  };
  const fly = async (delay: number, warn: number): Promise<FlightResult> => {
    const engine = await loadEngine();
    engine.reset();
    const h = engine.buildRocket(JSON.stringify(tree()));
    engine.setMotorById(h, 'm', 'C6', 0.018, 0.07, [0, 0.2, 1.8], [0, 14, 0], [0.024, 0.022, 0.012], 0.035, delay);
    return JSON.parse(
      engine.simulateJson(h, JSON.stringify({ launchRodLength: 1, randomSeed: 7, recoverySpeedWarn: warn })),
    ) as FlightResult;
  };

  for (const delay of [0.5, 1, 2]) {
    it(`judges the chute that opened last, with the first opened on a ${delay} s delay`, async () => {
      const probe = await fly(delay, 0.01);
      const deploys = probe.events.filter((e) => e.type === 'RECOVERY_DEVICE_DEPLOYMENT');
      expect(deploys.map((e) => e.source)).toEqual(['Early', 'Late']);
      const lateSpeed = probe.summary.deploymentVelocity!;

      const warn = lateSpeed + 1;
      const result = await fly(delay, warn);
      const warned = result.warnings!.filter((w) => w.key === 'HighSpeedDeployment');
      expect(warned).toHaveLength(1);
      expect(warned[0]!.sourceIds).toEqual(['early']);
      expect(result.summary.deploymentVelocity!).toBeLessThan(warn);

      const devices = lastDeployment(result.events);
      expect(devices.map((d) => d.id)).toEqual(['late']);
      expect(deploymentVerdict(result.summary.deploymentVelocity!, result.warnings, warn, devices)).toBeNull();
      const named = devices.map((d) => ({ name: d.name }));
      const withoutIds = result.warnings!.map(({ sourceIds: _, ...w }) => w);
      expect(deploymentVerdict(result.summary.deploymentVelocity!, withoutIds, warn, named)).toBeNull();
    });
  }

  it('judges both chutes when they open at the same instant', async () => {
    const engine = await loadEngine();
    engine.reset();
    const t = tree();
    const kids = t.components[0]!.children[1]!.children as Record<string, unknown>[];
    kids[kids.length - 1] = { ...kids[kids.length - 1], deployEvent: 'ejection' };
    const h = engine.buildRocket(JSON.stringify(t));
    engine.setMotorById(h, 'm', 'C6', 0.018, 0.07, [0, 0.2, 1.8], [0, 14, 0], [0.024, 0.022, 0.012], 0.035, 1);
    const result = JSON.parse(
      engine.simulateJson(h, JSON.stringify({ launchRodLength: 1, randomSeed: 7, recoverySpeedWarn: 0.01 })),
    ) as FlightResult;
    expect(
      lastDeployment(result.events)
        .map((d) => d.id)
        .sort(),
    ).toEqual(['early', 'late']);
  });
});

const deployedSources = (events: FlightResult['events']) =>
  events.flatMap((e) => (e.type === 'RECOVERY_DEVICE_DEPLOYMENT' ? [e.source] : []));
