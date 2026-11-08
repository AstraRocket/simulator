import { describe, expect, it, vi } from 'vitest';
import { defaultNode } from '../../../src/services/design/treeEdit';
import { defaultMaterialPatch } from '../../../src/services/design/materialSlots';
import { KERNEL_DEFAULTS } from '../../../src/tree/kernelDefaults';
import type { ComponentNode, ComponentType } from '../../../src/engine/openRocketEngine';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';
import { loadEngine } from '../../testing/kernelGeometry';

type Engine = Awaited<ReturnType<typeof loadEngine>>;

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

const seeded = (type: ComponentType): ComponentNode =>
  ({ ...defaultNode(type), ...defaultMaterialPatch(type, {}), id: 'probe' }) as ComponentNode;

// Constructor auto flags (BodyTube.java:42, Transition.java:49-50, TubeFinSet.java:26, TubeCoupler.java:12, CenteringRing.java:12-13,
// Bulkhead.java:12, EngineBlock.java:15, RecoveryDevice.java:27, Parachute.java:24, ShockCord.java:17); the bridge clears them for an absent key.
const CONSTRUCTOR_AUTO: Partial<Record<ComponentType, string[]>> = {
  bodytube: ['outerRadiusAuto'],
  transition: ['foreRadiusAuto', 'aftRadiusAuto'],
  tubefinset: ['outerRadiusAuto'],
  tubecoupler: ['outerRadiusAuto'],
  centeringring: ['outerRadiusAuto', 'innerRadiusAuto'],
  bulkhead: ['outerRadiusAuto'],
  engineblock: ['outerRadiusAuto'],
  parachute: ['cdAuto', 'lineLengthAuto'],
  streamer: ['cdAuto'],
  shockcord: ['cordLengthAuto'],
};

const APP_CHOICES: Partial<Record<ComponentType, string[]>> = {
  innertube: ['motorMount', 'motorOverhang'],
  parachute: ['deployEvent'],
  streamer: ['deployEvent'],
  parallelstage: ['length', 'positionX', 'instanceRadius', 'overrideCD'],
};

const TYPES = (Object.keys(KERNEL_DEFAULTS) as ComponentType[]).filter((t) => t !== 'stage' && t !== 'fairing');

const CHAIN: ReadonlySet<ComponentType> = new Set(['nosecone', 'bodytube', 'transition']);

const design = (probe: ComponentNode, tubeLength = 0.5): unknown => {
  const nose = { type: 'nosecone', id: 'nose', length: 0.1, aftRadius: 0.025 };
  const chain = CHAIN.has(probe.type)
    ? probe.type === 'nosecone'
      ? [probe, { type: 'bodytube', id: 'tube', outerRadius: 0.025, length: tubeLength }]
      : [nose, probe]
    : [nose, { type: 'bodytube', id: 'tube', outerRadius: 0.025, length: tubeLength, children: [probe] }];
  return { components: [{ type: 'stage', id: 'st', children: chain }] };
};

const infoOf = (engine: Engine, tree: unknown): Record<string, number | string | undefined> => {
  engine.reset();
  const handle = engine.buildRocket(JSON.stringify(tree));
  const info = JSON.parse(engine.getComponentInfo(handle, 'probe'));
  expect(info.error).toBeUndefined();
  return info;
};

const fieldsOf = (engine: Engine, tree: unknown): Record<string, unknown> => {
  engine.reset();
  const handle = engine.buildRocket(JSON.stringify(tree));
  const fields = JSON.parse(engine.getComponentFields(handle, 'probe')) as Record<string, unknown>;
  expect(fields['error']).toBeUndefined();
  return fields;
};

const same = (a: unknown, b: unknown): boolean =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 1e-9 + 1e-9 * Math.abs(b) : a === b;

describe('a new part from the add list', () => {
  it.each(TYPES)('%s is the part the kernel builds from a node with no keys', async (type) => {
    const engine = await loadEngine();
    const flags = Object.fromEntries((CONSTRUCTOR_AUTO[type] ?? []).map((flag) => [flag, true]));
    const keyless = fieldsOf(engine, design({ type, id: 'probe', ...flags } as ComponentNode));
    const part = fieldsOf(engine, design(seeded(type)));
    const skip = new Set(APP_CHOICES[type] ?? []);
    const differences = Object.keys(keyless)
      .filter((key) => !skip.has(key) && !same(part[key], keyless[key]))
      .map((key) => `${key}: seeded ${String(part[key])}, constructor ${String(keyless[key])}`);
    expect(differences, differences.join('\n')).toEqual([]);
    const unused = [...skip].filter((key) => same(part[key], keyless[key]));
    expect(unused).toEqual([]);
  });

  it('is a rail button of desktop dimensions and material', async () => {
    const engine = await loadEngine();
    const mass = infoOf(engine, design(seeded('railbutton'))).mass as number;
    expect(mass).toBeGreaterThan(0);
    expect(mass).toBeCloseTo(
      infoOf(engine, design({ type: 'railbutton', id: 'probe' } as ComponentNode)).mass as number,
      12,
    );
  });

  it('is a shock cord whose cord follows the rocket, as on desktop', async () => {
    const engine = await loadEngine();
    const short = infoOf(engine, design(seeded('shockcord'), 0.5));
    const long = infoOf(engine, design(seeded('shockcord'), 1.0));
    expect(short.cordLength).not.toBeCloseTo(defaultNode('shockcord')['cordLength'] as number, 6);
    expect(long.cordLength as number).toBeGreaterThan(short.cordLength as number);
    expect(long.mass as number).toBeGreaterThan(short.mass as number);
  });

  it('is a tube fin set sized to the body it is on, as on desktop', async () => {
    const engine = await loadEngine();
    const fins = seeded('tubefinset');
    expect(fins['outerRadiusAuto']).toBe(true);
    expect(fins['outerRadius']).toBeUndefined();
    expect(fins['thickness']).toBeUndefined();
    const narrow = fieldsOf(engine, {
      components: [
        { type: 'nosecone', id: 'nose', length: 0.1, aftRadius: 0.0125 },
        { type: 'bodytube', id: 'tube', outerRadius: 0.0125, length: 0.5, children: [fins] },
      ],
    });
    const wide = fieldsOf(engine, design(fins));
    expect(narrow['outerRadius'] as number).toBeLessThan(wide['outerRadius'] as number);
  });

  it('is a pod set of two copies with nothing in it, as on desktop', async () => {
    const engine = await loadEngine();
    const pods = seeded('podset');
    expect(pods.children ?? []).toHaveLength(0);
    const info = infoOf(engine, design(pods));
    expect(info.error).toBeUndefined();
    expect(fieldsOf(engine, design(pods))['instanceCount']).toBe(KERNEL_DEFAULTS.podset.instanceCount);
  });

  it('is a booster that builds beside its tube and flies two copies', async () => {
    const engine = await loadEngine();
    const booster = seeded('parallelstage');
    const info = infoOf(engine, design(booster));
    expect(info.sectionMass as number).toBeGreaterThan(0);
    const handle = engine.buildRocket(JSON.stringify(design(booster)));
    const stat = JSON.parse(engine.getStaticInfo(handle));
    expect(stat.error).toBeUndefined();
    expect(booster['instanceCount']).toBe(2);
  });
});
