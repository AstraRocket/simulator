// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';
import { serveData } from '../../testing/serveData';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

// With ORK_SAMPLES_DIR set, files are written there for `npm run check:ork` to open in desktop.

const saved = vi.hoisted(() => ({ archives: [] as Uint8Array[], inputs: [] as unknown[], rkt: [] as string[] }));
vi.mock('../../../src/services/files/saveOrk', async (orig) => {
  const real = await orig<typeof import('../../../src/services/files/saveOrk')>();
  return {
    ...real,
    downloadOrk: (input: Parameters<typeof real.orkArchive>[0]) => {
      saved.archives.push(real.orkArchive(input));
      saved.inputs.push(input);
    },
    downloadRkt: async (...[name, tree, componentInfo, stageFigures]: Parameters<typeof real.downloadRkt>) => {
      const { exportRkt } = await import('../../../src/services/files/rktExport');
      const { xml, skipped } = exportRkt(name, tree, componentInfo, stageFigures);
      saved.rkt.push(xml);
      return skipped;
    },
  };
});

import {
  __setEngineForTests,
  PLUGGED_DELAY,
  type ComponentNode,
  type MotorSpec,
  type RocketTree,
} from '../../../src/engine/openRocketEngine';
import { buildRocketTree } from '../../../src/engine/api';
import { useWorkspaceStore } from '../../../src/state/store';
import { defaultNode, findStages, syncDerived } from '../../../src/services/design/treeEdit';
import { clusterCount } from '../../../src/tree/cluster';
import {
  designDeployment,
  designSeparation,
  type DeployOverride,
  type FlightConfig,
  type SepOverride,
} from '../../../src/services/flight/flightConfigs';
import { effectivePrefs, newSimulation, type SimPrefs } from '../../../src/services/flight/simulations';
import { buildExportMotorMap } from '../../../src/services/motors/exportMotors';
import type { LaunchConditions } from '../../../src/services/design/orkTree';
import type { OrkExportMotor, OrkTreeExportInput } from '../../../src/services/files/orkTypes';
import { selectConfig } from '../../../src/state/workspaceSelectors';
import { DEFAULT_HEADING_DEG } from '../../../src/services/flight/windLevels';
import { G0 } from '../../../src/services/motors/motorMath';

const EXAMPLES = join(__dirname, '../../../public/examples');
const OUT = process.env.ORK_SAMPLES_DIR;

const s = () => useWorkspaceStore.getState();

/* eslint-disable @typescript-eslint/no-explicit-any -- the TeaVM bundle is untyped */
let engine: any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Parents before children, as the desktop iterates a rocket. */
function inOrder(
  nodes: readonly ComponentNode[],
  depth = 0,
  out: { node: ComponentNode; depth: number }[] = [],
): { node: ComponentNode; depth: number }[] {
  for (const node of nodes) {
    out.push({ node, depth });
    inOrder((node.children ?? []) as ComponentNode[], depth + 1, out);
  }
  return out;
}

const rktCopies = (n: ComponentNode): number =>
  n.type === 'innertube'
    ? clusterCount(typeof n['cluster'] === 'string' ? n['cluster'] : undefined)
    : n.type === 'podset' || n.type === 'parallelstage'
      ? Number(n['instanceCount'] ?? 1)
      : 1;

function writeKernelFields(name: string): void {
  if (!OUT) return;
  const tree = s().tree;
  engine.reset();
  const handle = engine.buildRocket(JSON.stringify(tree));
  const parts = inOrder(tree.components).map(({ node: n, depth }) => {
    const fields = JSON.parse(engine.getComponentFields(handle, n.id)) as Record<string, unknown>;
    expect(fields.error, `${name}: ${n.type}`).toBeUndefined();
    return { type: n.type, name: n.name ?? '', depth, rktCopies: rktCopies(n), fields };
  });
  writeFileSync(join(OUT, `${name}.kernel.json`), JSON.stringify(parts));
}

type AppInput = Pick<OrkTreeExportInput, 'tree' | 'configs' | 'activeConfigId' | 'simulations'>;

/** Keyed as `OrkFields` reads desktop: parts by tree index, radians, kelvin, pascal. */
function writeAppView(name: string, input: AppInput): void {
  if (!OUT) return;
  const parts = inOrder(input.tree.components).map(({ node }) => node);
  const index = (id: string | undefined) => parts.findIndex((n) => n.id === id);
  const stages = findStages(input.tree);
  const separators = stages.slice(1);
  const configs = input.configs ?? [];
  const defaultId = configs.find((c) => c.id === input.activeConfigId)?.id ?? configs[0]?.id;
  const view = {
    configs: configs.map((c) => ({
      id: c.id,
      default: c.id === defaultId,
      motors: Object.entries(c.motors ?? {})
        .map(([mount, m]: [string, OrkExportMotor]) => ({
          part: index(mount),
          designation: m.designation,
          ...(m.digest ? { digest: m.digest } : {}),
          ...(m.embedded ? { embedded: true } : {}),
          delay: m.delay >= PLUGGED_DELAY ? null : m.delay,
          ignitionEvent: m.ignitionEvent ?? 'automatic',
          ignitionDelay: m.ignitionDelay ?? 0,
        }))
        .sort((a, b) => a.part - b.part),
      deployments: parts
        .filter((n) => n.type === 'parachute' || n.type === 'streamer')
        .map((n) => {
          const d = { ...designDeployment(n), ...((c.deployments?.[n.id as string] ?? {}) as DeployOverride) };
          return { part: index(n.id), event: d.deployEvent, altitude: d.deployAltitude, delay: d.deployDelay };
        }),
      separations: separators.map((n) => {
        const d = { ...designSeparation(n), ...((c.separations?.[n.id as string] ?? {}) as SepOverride) };
        return {
          part: index(n.id),
          event: d.separationEvent,
          delay: d.separationDelay,
          altitude: d.separationAltitude,
        };
      }),
      stages: stages.map((n) => !(c.grounded ?? []).includes(n.id as string)),
    })),
    sims: (input.simulations ?? []).map((sim) => ({
      name: sim.name,
      configId: configs.some((c) => c.id === sim.configId) ? sim.configId : defaultId,
      conditions: conditionsView(sim.launch, sim.prefs),
    })),
  };
  writeFileSync(join(OUT, `${name}.app.json`), JSON.stringify(view));
}

const rad = (deg: number) => (deg * Math.PI) / 180;

function conditionsView(l: LaunchConditions, prefs: Partial<SimPrefs> | undefined): Record<string, unknown> {
  const isa = l.temperatureC === null && l.pressureHPa === null && l.relativeHumidity == null;
  const flown = l.windLevels ?? [];
  const levels = flown.length ? flown : (l.keptWindLevels ?? []);
  return {
    launchRodLength: l.launchRodLengthM ?? 0,
    launchRodAngle: rad(l.launchRodAngleDeg ?? 0),
    launchRodDirection: rad(l.launchRodDirectionDeg ?? DEFAULT_HEADING_DEG),
    launchIntoWind: l.launchIntoWind === true,
    launchAltitude: l.launchAltitudeM ?? 0,
    launchLatitude: l.latitudeDeg ?? 0,
    launchLongitude: l.longitudeDeg ?? -80.6,
    geodetic: l.geodetic ?? 'spherical',
    isa,
    // Desktop keeps a base temperature and pressure under ISA too, and flies neither.
    ...(isa ? {} : { temperature: (l.temperatureC ?? 15) + 273.15, pressure: (l.pressureHPa ?? 1013.25) * 100 }),
    ...(prefs?.timeStep !== undefined ? { timeStep: prefs.timeStep } : {}),
    ...(prefs?.maxTime !== undefined ? { maxTime: prefs.maxTime } : {}),
    gravityModel: l.gravityModel ?? 'wgs',
    // Under WGS desktop keeps the user's own constant, which it does not fly.
    ...(l.gravityModel === 'constant' ? { constantGravity: l.constantGravity ?? G0 } : {}),
    windModel: flown.length ? 'multilevel' : 'average',
    windAverage: l.windAverage ?? 0,
    windStdDev: l.windStdDev ?? 0,
    windDirection: rad(l.windDirectionDeg ?? DEFAULT_HEADING_DEG),
    windAltitudeReference: levels.length ? (l.windAltitudeReference ?? 'msl') : undefined,
    // Desktop's multilevel model invents a level when the file gives none.
    windLevels: levels.length
      ? levels.map((w) => ({
          altitude: w.altitudeM,
          speed: w.speed,
          direction: rad(w.directionDeg),
          standardDeviation: w.stddev,
        }))
      : undefined,
  };
}

function importView(): AppInput {
  const st = s();
  return {
    tree: st.tree,
    configs: st.configs.map((c: FlightConfig) => ({
      ...c,
      motors: buildExportMotorMap(st.tree, c, st.loadedMeta?.exportMotors ?? {}),
    })),
    activeConfigId: selectConfig(st).id,
    simulations: st.sims.map((sim) => ({
      name: sim.name,
      configId: sim.configId,
      launch: sim.launch,
      status: 'notsimulated' as const,
      ...(st.simPrefs ? { prefs: effectivePrefs(st.simPrefs, sim.prefs) } : {}),
    })),
  };
}

const part = (type: ComponentNode['type'], patch: Partial<ComponentNode> = {}): ComponentNode => ({
  ...defaultNode(type),
  ...patch,
});

function everyPart(): RocketTree {
  const body = part('bodytube', { length: 0.5, outerRadius: 0.05, outerRadiusAuto: false, thickness: 0.002 });
  body.children = [
    part('innertube', { cluster: '3-ring', clusterScale: 1.2, clusterRotation: 0.3 }),
    part('innertube', {
      outerRadius: 0.012,
      thickness: 0.0005,
      motorMount: true,
      motorOverhang: 0.005,
      ignitionEvent: 'burnout',
      ignitionDelay: 1.5,
    }),
    part('innertube', { radialPosition: 0.01, radialDirection: 0.5, motorMount: false, motorOverhang: 0 }),
    part('centeringring', { instanceCount: 2 }),
    part('bulkhead', { position: { method: 'absolute', offset: 0.3 } }),
    part('engineblock'),
    part('tubecoupler'),
    part('launchlug', { instanceCount: 2, angleOffset: 1, instanceSeparation: 0.08 }),
    part('railbutton', { instanceCount: 2 }),
    part('parachute', { deployEvent: 'altitude', deployAltitude: 150, deployDelay: 1, comment: 'Main chute' }),
    part('streamer', { deployEvent: 'lower_stage_separation' }),
    part('shockcord'),
    part('masscomponent', { overrideCGX: 0.01 }),
    part('masscomponent', { mass: 0.05, massComponentType: 'altimeter' }),
    part('masscomponent', { mass: 0.02, massComponentType: 'battery', radiusAuto: true }),
    {
      ...part('podset'),
      children: [
        {
          ...part('bodytube', { length: 0.15, outerRadius: 0.01, outerRadiusAuto: false, thickness: 0.001 }),
          children: [part('trapezoidfinset', { finCount: 2 })],
        },
      ],
    },
  ];
  body.overrideMass = 0.2;
  body.materialName = 'Fiberglass';
  body.density = 1850;
  const tail = part('bodytube', { length: 0.3, outerRadius: 0.04, outerRadiusAuto: false, thickness: 0.002 });
  tail.overrideCD = 0.4;
  tail.children = [
    part('trapezoidfinset', {
      tabLength: 0.03,
      tabHeight: 0.01,
      tabOffset: 0,
      tabOffsetMethod: 'middle',
      cant: 0.05,
      filletRadius: 0.003,
      filletMaterialName: 'Epoxy',
      filletDensity: 1200,
    }),
    part('ellipticalfinset', { rotation: 0.4, crossSection: 'airfoil' }),
    part('freeformfinset', { rotation: 0.8 }),
    part('tubefinset', { outerRadius: 0.01, outerRadiusAuto: false }),
    part('parallelstage'),
  ];
  // Transition.isCompatible allows a freeform fin set.
  const transition = part('transition', {
    shape: 'ellipsoid',
    clipped: false,
    foreShoulderLength: 0.03,
    aftShoulderLength: 0.03,
    position: { method: 'after', offset: 0 },
  });
  transition.children = [part('freeformfinset', { finCount: 4 })];
  const booster = part('bodytube', { length: 0.3, outerRadius: 0.04, outerRadiusAuto: false, thickness: 0.002 });
  return syncDerived({
    name: 'Every part',
    components: [
      {
        ...part('stage'),
        children: [
          part('nosecone', { aftRadiusAuto: true, shape: 'haack', shapeParameter: 0.3, comment: 'Haack nose' }),
          body,
          transition,
          tail,
          part('nosecone', {
            flipped: true,
            filled: true,
            aftRadius: 0.04,
            aftRadiusAuto: false,
            length: 0.06,
            shoulderAuto: false,
            shoulderRadius: 0.045,
            shoulderLength: 0.02,
            shoulderThickness: 0.002,
          }),
        ],
      },
      {
        ...part('stage'),
        separationEvent: 'burnout',
        separationDelay: 1,
        overrideMass: 0.3,
        overrideCGX: 0.12,
        overrideSubcomponentsMass: true,
        overrideSubcomponentsCG: true,
        children: [booster],
      },
    ],
  } as RocketTree);
}

/** UUIDs, as the app mints them: desktop reads any other string as a different id. */
const STAGED = '7d0c2f3e-5b8a-4c1d-9e6f-0a1b2c3d4e5f';
const SINGLE = '1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9';

const HOMEMADE: MotorSpec = {
  designation: 'X42',
  manufacturer: 'Homemade',
  diameter: 0.018,
  length: 0.07,
  cgX: 0.035,
  ejectionDelay: 4,
  times: [0, 0.1, 0.6, 1.2, 1.5],
  thrusts: [0, 14, 9, 6, 0],
  masses: [0.026, 0.025, 0.02, 0.015, 0.0125],
};

function conditionsWorkspace() {
  const st = s();
  const stock = Object.values(st.configs[0]!.motors)[0]!.spec;
  const tube = (patch: Partial<ComponentNode>) =>
    part('bodytube', { length: 0.35, outerRadius: 0.0125, outerRadiusAuto: false, thickness: 0.0005, ...patch });
  const mount = (id: string) =>
    part('innertube', { id, outerRadius: 0.0095, thickness: 0.0003, length: 0.075, motorMount: true });
  const chute = part('parachute', { id: 'chute' });
  const sustainer = tube({ id: 'sustainer-tube' });
  sustainer.children = [mount('sustainer-mount'), chute, part('trapezoidfinset')];
  const boosterTube = tube({ id: 'booster-tube', length: 0.2 });
  boosterTube.children = [mount('booster-mount'), part('trapezoidfinset')];
  const tree = syncDerived({
    name: 'Conditions',
    components: [
      { ...part('stage'), id: 'sustainer', children: [part('nosecone', { aftRadiusAuto: true }), sustainer] },
      { ...part('stage'), id: 'booster', children: [boosterTube] },
    ],
  } as RocketTree);
  const configs: FlightConfig[] = [
    {
      id: STAGED,
      name: 'Staged',
      motors: {
        'sustainer-mount': { spec: stock, ignitionEvent: 'burnout', ignitionDelay: 0.5 },
        'booster-mount': { spec: HOMEMADE, ignitionEvent: 'launch' },
      },
      deployments: { chute: { deployEvent: 'altitude', deployAltitude: 150, deployDelay: 1 } },
      separations: { booster: { separationEvent: 'burnout', separationDelay: 0.5 } },
    },
    {
      id: SINGLE,
      name: null,
      motors: { 'sustainer-mount': { spec: stock } },
      deployments: { chute: { deployEvent: 'apogee' } },
      grounded: ['booster'],
    },
  ];
  const site: LaunchConditions = {
    ...st.sims[0]!.launch,
    launchRodLengthM: 2,
    launchRodAngleDeg: 3,
    launchRodDirectionDeg: 45,
    launchAltitudeM: 1200,
    latitudeDeg: 32.9,
    longitudeDeg: -106.9,
    geodetic: 'wgs84',
    temperatureC: 22,
    pressureHPa: 880,
    relativeHumidity: 0.35,
    atmosphereLevels: [
      { altitudeM: 2000, temperatureC: 15, pressureHPa: 800, relativeHumidity: 0.3 },
      { altitudeM: 4000, temperatureC: 2, pressureHPa: 620, relativeHumidity: 0.2 },
    ],
    gravityModel: 'constant',
    constantGravity: 9.79,
    windAverage: 3,
    windStdDev: 0.3,
    windAltitudeReference: 'agl',
    windLevels: [
      { altitudeM: 0, speed: 3, directionDeg: 270, stddev: 0.3 },
      { altitudeM: 300, speed: 6, directionDeg: 280, stddev: 0.6 },
      { altitudeM: 900, speed: 9, directionDeg: 300, stddev: 0.9 },
    ],
  };
  const calm: LaunchConditions = {
    ...st.sims[0]!.launch,
    temperatureC: null,
    pressureHPa: null,
    relativeHumidity: null,
    windLevels: undefined,
    keptWindLevels: undefined,
    atmosphereLevels: undefined,
  };
  const sims = [newSimulation('Staged at the site', STAGED, site), newSimulation('Single', SINGLE, calm)];
  return { tree, configs, sims, activeId: sims[0]!.id };
}

async function save(): Promise<Uint8Array> {
  saved.archives.length = 0;
  saved.inputs.length = 0;
  useWorkspaceStore.setState({ rocket: buildRocketTree(s().tree) });
  await s().saveOrk();
  expect(s().err).toBeNull();
  expect(saved.archives).toHaveLength(1);
  return saved.archives[0]!;
}

async function saveRkt(): Promise<string> {
  saved.rkt.length = 0;
  useWorkspaceStore.setState({ rocket: buildRocketTree(s().tree) });
  await s().saveRkt();
  expect(saved.rkt).toHaveLength(1);
  return saved.rkt[0]!;
}

function checkRkt(name: string, xml: string): void {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  expect(doc.querySelector('parsererror'), name).toBeNull();
  expect(doc.documentElement.tagName, name).toBe('RockSimDocument');
  if (OUT) writeFileSync(join(OUT, name), xml);
}

function check(name: string, archive: Uint8Array): void {
  const xml = strFromU8(unzipSync(archive)['rocket.ork']!);
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  expect(doc.querySelector('parsererror'), name).toBeNull();
  for (const d of doc.querySelectorAll('motormount > motor > designation')) {
    expect(d.textContent, name).not.toBe('');
  }
  if (OUT) writeFileSync(join(OUT, name), archive);
  writeAppView(name, saved.inputs[0] as AppInput);
}

function writeSource(f: string, bytes: Uint8Array): void {
  if (!OUT) return;
  mkdirSync(join(OUT, 'source'), { recursive: true });
  writeFileSync(join(OUT, 'source', f), bytes);
  writeKernelFields(`source/${f}`);
  writeAppView(`source/${f}`, importView());
}

beforeAll(async () => {
  /* eslint-disable @typescript-eslint/no-explicit-any -- the TeaVM bundle is untyped */
  (globalThis as any).$rt_putStdoutCustom ??= () => {};
  (globalThis as any).$rt_putStderrCustom ??= () => {};
  engine = await import('../../../src/engine/vendor/openrocket-engine.mjs' as string);
  __setEngineForTests(engine);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  serveData();
  if (OUT) mkdirSync(OUT, { recursive: true });
});

describe('.ork files the app saves', () => {
  it('for the default design', async () => {
    s().resetWorkspace();
    expect(s().err).toBeNull();
    check('default-design.ork', await save());
    checkRkt('default-design.rkt', await saveRkt());
    writeKernelFields('default-design.ork');
    writeKernelFields('default-design.rkt');
  });

  it('for a design with every part type', async () => {
    s().resetWorkspace();
    useWorkspaceStore.setState({ tree: everyPart() });
    expect(s().err).toBeNull();
    check('every-part.ork', await save());
    checkRkt('every-part.rkt', await saveRkt());
    writeKernelFields('every-part.ork');
    writeKernelFields('every-part.rkt');
  });

  it('for a design with flight configurations and simulation conditions of its own', async () => {
    s().resetWorkspace();
    expect(s().err).toBeNull();
    useWorkspaceStore.setState(conditionsWorkspace());
    expect(s().err).toBeNull();
    check('conditions.ork', await save());
    writeKernelFields('conditions.ork');
  });

  it('for the RockSim fixture, opened and saved', async () => {
    const f = 'rocksim.rkt';
    const bytes = readFileSync(join(EXAMPLES, '../../e2e/fixtures', f));
    await s().openOrkFile(new Blob([bytes]));
    expect(s().err).toBeNull();
    writeSource(f, bytes);
    check('rocksim-from-rkt.ork', await save());
    writeKernelFields('rocksim-from-rkt.ork');
  });

  it.each(readdirSync(EXAMPLES).filter((f) => f.endsWith('.ork')))(
    'for the example %s, opened and saved',
    async (f) => {
      const bytes = readFileSync(join(EXAMPLES, f));
      await s().openOrkFile(new Blob([bytes]));
      expect(s().err).toBeNull();
      writeSource(f, bytes);
      check(f, await save());
      checkRkt(f.replace(/\.ork$/, '.rkt'), await saveRkt());
      writeKernelFields(f);
      writeKernelFields(f.replace(/\.ork$/, '.rkt'));
    },
  );
});
