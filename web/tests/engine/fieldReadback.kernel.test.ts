import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ComponentNode, ComponentType, RocketTree } from '../../src/engine/openRocketEngine';
import { FIELDS, type Field } from '../../src/services/design/componentFields';
import {
  isKernelAutoKey,
  fieldApplies,
  fieldRange,
  fieldValue,
  liveBounds,
} from '../../src/services/design/fieldRange';
import { defaultNode, syncDerived } from '../../src/services/design/treeEdit';
import { REQUIRED_COMPONENT_FIELDS } from '../../src/services/design/requiredComponent';
import { parentRadiusOf } from '../../src/tree/finPlanform';
import { num, positionOf } from '../../src/tree/nodeProps';
import { loadEngine } from '../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

// The 50 mm airframe keeps a fallback to the kernel's 25 mm auto radius from passing by coincidence.
type Miss = { rule: string; label: string; app: unknown; kernel: unknown };
type Known = { why: string; when: (app: number, kernel: number) => boolean };

const KNOWN: Record<string, Known> = {};

const hasTab = (n: ComponentNode) => num(n, 'tabHeight') > 0 && num(n, 'tabLength') > 0;
const READ_ONLY_WHEN: Record<string, (n: ComponentNode) => boolean> = {
  // ComponentFactory.applyFinTabs builds a tab only when both are positive.
  tabLength: hasTab,
  tabHeight: hasTab,
  tabOffset: hasTab,
  tabOffsetMethod: hasTab,
};

const TAB = { tabLength: 0.02, tabHeight: 0.005, tabOffset: 0, tabOffsetMethod: 'middle' };
const ALTITUDE_DEPLOY = { deployEvent: 'altitude', deployAltitude: 300 };
const ALTITUDE_SEPARATION = { separationEvent: 'altitudeascending', separationAltitude: 300 };
const SEEDS: Record<string, Record<string, Partial<ComponentNode>>> = {
  nosecone: {
    'power shape': { shape: 'power' },
    'haack shape': { shape: 'haack' },
    'parabolic shape': { shape: 'parabolic' },
  },
  transition: {
    'ogive shape': { shape: 'ogive' },
    'ellipsoid shape': { shape: 'ellipsoid' },
    'power shape': { shape: 'power' },
    'parabolic shape': { shape: 'parabolic' },
    'haack shape': { shape: 'haack' },
  },
  innertube: {
    '3-ring cluster': { cluster: '3-ring' },
    'own ignition': { motorMount: true, ignitionEvent: 'burnout', ignitionDelay: 2.5 },
  },
  bodytube: { 'own ignition': { motorMount: true, ignitionEvent: 'ejectioncharge', ignitionDelay: 1 } },
  trapezoidfinset: { 'with a tab': TAB },
  ellipticalfinset: { 'with a tab': TAB },
  freeformfinset: { 'with a tab': TAB },
  parachute: { 'altitude deploy': ALTITUDE_DEPLOY },
  streamer: { 'altitude deploy': ALTITUDE_DEPLOY },
  stage: { 'altitude separation': ALTITUDE_SEPARATION },
  parallelstage: { 'altitude separation': ALTITUDE_SEPARATION },
};

const NO_KEY = new Set(['text', 'bore', 'derived']);

const NOSE: ComponentNode = {
  type: 'nosecone',
  id: 'nose',
  shape: 'ogive',
  length: 0.15,
  aftRadius: 0.05,
  thickness: 0.002,
};
const TUBE: ComponentNode = { type: 'bodytube', id: 'tube', length: 0.4, outerRadius: 0.05, thickness: 0.002 };
const TAIL: ComponentNode = { type: 'bodytube', id: 'tail', length: 0.3, outerRadius: 0.04, thickness: 0.002 };
const POD_TUBE: ComponentNode = { type: 'bodytube', id: 'pod-tube', length: 0.1, outerRadius: 0.01, thickness: 0.001 };

function host(part: ComponentNode): RocketTree {
  const p = { ...part, id: 'p' };
  const stage = (id: string, children: ComponentNode[]) => ({ type: 'stage', id, children }) as ComponentNode;
  switch (part.type) {
    case 'stage':
      return { components: [stage('stage1', [NOSE, TUBE]), { ...p, children: [TAIL] }] } as RocketTree;
    case 'nosecone':
      return { components: [stage('stage1', [p, TUBE])] } as RocketTree;
    case 'bodytube':
      return { components: [stage('stage1', [NOSE, p])] } as RocketTree;
    case 'transition':
      return { components: [stage('stage1', [NOSE, TUBE, p, TAIL])] } as RocketTree;
    case 'podset':
    case 'parallelstage':
      return {
        components: [stage('stage1', [NOSE, { ...TUBE, children: [{ ...p, children: [POD_TUBE] }] }])],
      } as RocketTree;
    default:
      return { components: [stage('stage1', [NOSE, { ...TUBE, children: [p] }])] } as RocketTree;
  }
}

function find(nodes: readonly ComponentNode[], id: string): ComponentNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = find((n.children ?? []) as ComponentNode[], id);
    if (hit) return hit;
  }
  return undefined;
}

const PAST_OPEN_MAX: Partial<Record<Field['kind'], number>> = {
  angle: 1.5 * Math.PI,
  length: 0.2,
  number: 2.5,
  distance: 500,
  mass: 0.5,
};

// Counts have no probe: a thrown build leaves later builds answering with stale defaults.
const BELOW_FLOOR: Partial<Record<Field['kind'], number>> = {
  angle: 0.5,
  length: 0.01,
  number: 0.5,
  distance: 50,
  mass: 0.1,
};

// `ComponentFactory.NON_NEGATIVE`, read from the Java so it cannot drift.
const BRIDGE_NON_NEGATIVE: ReadonlySet<string> = (() => {
  const java = readFileSync(join(process.cwd(), '../engine-java/src/api/java/api/ComponentFactory.java'), 'utf8');
  const from = java.indexOf('NON_NEGATIVE = ');
  const list = java.slice(from, java.indexOf('));', from));
  const keys = [...list.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]!);
  if (keys.length < 10) throw new Error('ComponentFactory.NON_NEGATIVE not found');
  return new Set(keys);
})();

const BOUNDED_PAST_KERNEL: Record<string, string> = {
  'stage.separationDelay': 'SeparationSelectionDialog floors SeparationDelay at 0',
  'stage.separationAltitude': 'SeparationSelectionDialog floors SeparationAltitude at 0',
  'parallelstage.separationDelay': 'SeparationSelectionDialog floors SeparationDelay at 0',
  'parallelstage.separationAltitude': 'SeparationSelectionDialog floors SeparationAltitude at 0',
  'podset.radiusOffset': 'ComponentAssemblyConfig floors RadiusOffset at 0',
  'parallelstage.radiusOffset': 'ComponentAssemblyConfig floors RadiusOffset at 0',
  'trapezoidfinset.tabOffset': 'the panel keeps the tab within the root chord',
  'ellipticalfinset.tabOffset': 'the panel keeps the tab within the root chord',
  'freeformfinset.tabOffset': 'the panel keeps the tab within the root chord',
};

type Case = {
  label: string;
  node: ComponentNode;
  probe?: { key: string; value: number };
};

function cases(type: string, fields: Field[], seedLabel: string, seed: ComponentNode): Case[] {
  const out: Case[] = [{ label: seedLabel, node: seed }];
  for (const f of fields) {
    if (NO_KEY.has(f.kind)) continue;
    if (f.key in seed) {
      const without: ComponentNode = { ...seed };
      delete without[f.key];
      if (f.auto) delete without[f.auto.flag];
      out.push({ label: `${seedLabel}, without ${f.key}`, node: without });
    }
    const unflagged: ComponentNode = f.auto ? { ...seed, [f.auto.flag]: false } : seed;
    const tabDepth = parentRadiusOf(syncDerived(host(unflagged)), 'p');
    const r = fieldRange(unflagged, f, liveBounds(f, tabDepth));
    const ends = [r.min, r.max ?? PAST_OPEN_MAX[f.kind]].filter((v): v is number => v !== undefined);
    const refusedAtZero = (REQUIRED_COMPONENT_FIELDS[type] ?? []).includes(f.key);
    for (const v of ends.filter((e) => !(refusedAtZero && e === 0)))
      out.push({ label: `${seedLabel}, ${f.key} = ${+v.toFixed(6)}`, node: { ...unflagged, [f.key]: v } });
    if (f.auto) out.push({ label: `${seedLabel}, ${f.key} on Auto`, node: { ...seed, [f.auto.flag]: true } });
    // A closed whole-turn angle range has no outside, so it gets no below-floor probe.
    const below = BELOW_FLOOR[f.kind];
    const wholeTurn = f.kind === 'angle' && r.max !== undefined && r.max - (r.min ?? -Infinity) >= 2 * Math.PI - 1e-9;
    if (r.min !== undefined && below !== undefined && !wholeTurn && !BRIDGE_NON_NEGATIVE.has(f.key)) {
      const v = r.min - below;
      out.push({
        label: `${seedLabel}, ${f.key} = ${+v.toFixed(6)} (below the floor)`,
        node: { ...unflagged, [f.key]: v },
        probe: { key: f.key, value: v },
      });
    }
  }
  return out;
}

function seeds(type: string): [string, ComponentNode][] {
  const base = { ...defaultNode(type as ComponentType), id: 'p' };
  return [
    ['new part', base],
    ...Object.entries(SEEDS[type] ?? {}).map(([label, patch]): [string, ComponentNode] => [
      label,
      { ...base, ...patch },
    ]),
  ];
}

const norm = (v: unknown): unknown => (typeof v === 'string' ? v.toLowerCase().replace(/_/g, '') : v);

// Angles compare modulo whole turns: kernel setters reducePi, the panel keeps what was typed.
function agrees(app: unknown, kernel: unknown, angle: boolean): boolean {
  if (typeof app === 'number' && typeof kernel === 'number') {
    const turn = 2 * Math.PI;
    const d = angle ? Math.abs(((((app - kernel) % turn) + 1.5 * turn) % turn) - turn / 2) : Math.abs(app - kernel);
    return d <= 1e-9 + 1e-9 * Math.abs(kernel);
  }
  return norm(app) === norm(kernel);
}

describe('the panel shows what the kernel flies', () => {
  it('for every field, with keys absent, at the ends of each range, and on Auto', async () => {
    const engine = await loadEngine();
    const misses: Miss[] = [];
    const compared = new Set<string>();
    const boundedPastKernel = new Set<string>();
    for (const [type, fields] of Object.entries(FIELDS)) {
      for (const [seedLabel, seed] of seeds(type)) {
        for (const c of cases(type, fields, seedLabel, seed)) {
          const tree = syncDerived(host(c.node));
          const app = find(tree.components, 'p')!;
          engine.reset();
          const handle = engine.buildRocket(JSON.stringify(tree));
          const built = JSON.parse(engine.getComponentFields(handle, 'p')) as Record<string, unknown>;
          if (c.probe) {
            const f = fields.find((x) => x.key === c.probe!.key)!;
            if (typeof built.error === 'string' || !fieldApplies(app, f)) continue;
            if (READ_ONLY_WHEN[f.key] && !READ_ONLY_WHEN[f.key]!(app)) continue;
            const rule = `${type}.${f.key}`;
            if (agrees(c.probe.value, built[f.key], f.kind === 'angle')) {
              if (BOUNDED_PAST_KERNEL[rule]) boundedPastKernel.add(rule);
              else
                misses.push({
                  rule: `${rule} stops short of what the kernel keeps`,
                  label: c.label,
                  app: 'stopped',
                  kernel: built[f.key],
                });
            }
            continue;
          }
          if (typeof built.error === 'string') {
            misses.push({ rule: `${type} builds`, label: c.label, app: 'builds', kernel: built.error });
            continue;
          }
          for (const f of fields) {
            if (NO_KEY.has(f.kind) || !(f.key in built) || !fieldApplies(app, f)) continue;
            if (READ_ONLY_WHEN[f.key] && !READ_ONLY_WHEN[f.key]!(app)) continue;
            if (f.auto && app[f.auto.flag] === true && isKernelAutoKey(f.key)) continue;
            compared.add(`${type}.${f.key}`);
            const shown = fieldValue(app, f);
            if (!agrees(shown, built[f.key], f.kind === 'angle')) {
              misses.push({ rule: `${type}.${f.key}`, label: c.label, app: shown, kernel: built[f.key] });
            }
          }
          // Parts in the stage's own chain are laid end to end and read no position.
          if (!['stage', 'nosecone', 'bodytube', 'transition'].includes(type)) {
            compared.add(`${type}.position`);
            const pos = positionOf(app);
            const shown = `${pos.method} ${+pos.offset.toFixed(9)}`;
            const kernel = `${String(built.positionMethod)} ${+Number(built.positionOffset).toFixed(9)}`;
            if (shown !== kernel) misses.push({ rule: `${type}.position`, label: c.label, app: shown, kernel });
          }
        }
      }
    }
    const matched = new Set<string>();
    const unknown = misses.filter((m) => {
      const k = KNOWN[m.rule];
      if (k && typeof m.app === 'number' && typeof m.kernel === 'number' && k.when(m.app, m.kernel)) {
        matched.add(m.rule);
        return false;
      }
      return true;
    });
    const report = unknown.map((m) => `${m.rule} [${m.label}]: app ${String(m.app)}, kernel ${String(m.kernel)}`);
    expect(report, report.join('\n')).toEqual([]);
    expect(Object.keys(KNOWN).filter((rule) => !matched.has(rule))).toEqual([]);
    expect(Object.keys(BOUNDED_PAST_KERNEL).filter((rule) => !boundedPastKernel.has(rule))).toEqual([]);
    const never = Object.entries(FIELDS).flatMap(([type, fields]) =>
      fields.filter((f) => !NO_KEY.has(f.kind) && !compared.has(`${type}.${f.key}`)).map((f) => `${type}.${f.key}`),
    );
    expect(never).toEqual([]);
  });
});

describe('the overrides and materials the panel edits are what the kernel flies', () => {
  const OVERRIDES = {
    overrideMass: 0.123,
    overrideCGX: 0.045,
    overrideCD: 0.33,
    overrideSubcomponentsMass: true,
    overrideSubcomponentsCG: true,
    overrideSubcomponentsCD: true,
  };
  const MATERIAL_KEYS: [string, string, string, string][] = [
    // node name, node density, kernel name, kernel density
    ['materialName', 'density', 'materialName', 'density'],
    ['surfaceMaterialName', 'surfaceDensity', 'materialName', 'density'],
    ['lineMaterialName', 'lineDensity', 'lineMaterialName', 'lineDensity'],
    ['filletMaterialName', 'filletDensity', 'filletMaterialName', 'filletDensity'],
  ];
  // A shock cord's own material is its line (ShockCord.getMaterial, a LINE material).
  const SHOCK_CORD_KEYS: [string, string, string, string][] = [
    ['lineMaterialName', 'lineDensity', 'materialName', 'density'],
  ];

  const build = async (node: ComponentNode) => {
    const engine = await loadEngine();
    const tree = syncDerived(host(node));
    engine.reset();
    const handle = engine.buildRocket(JSON.stringify(tree));
    return {
      app: find(tree.components, 'p')!,
      built: JSON.parse(engine.getComponentFields(handle, 'p')) as Record<string, unknown>,
    };
  };

  it('for the mass, CG and drag overrides and the flags that spread them over the parts below', async () => {
    const misses: string[] = [];
    for (const type of Object.keys(FIELDS).filter((t) => t !== 'stage')) {
      const { app, built } = await build({ ...defaultNode(type as ComponentType), id: 'p', ...OVERRIDES });
      if (typeof built.error === 'string') {
        misses.push(`${type} builds: ${built.error}`);
        continue;
      }
      const expected: Record<string, unknown> = {
        massOverridden: true,
        overrideMass: app['overrideMass'],
        cgOverridden: true,
        overrideCGX: app['overrideCGX'],
        cdOverridden: true,
        overrideCD: app['overrideCD'],
        overrideSubcomponentsMass: true,
        overrideSubcomponentsCG: true,
        overrideSubcomponentsCD: true,
      };
      for (const [key, want] of Object.entries(expected))
        if (!agrees(want, built[key], false))
          misses.push(`${type}.${key}: app ${String(want)}, kernel ${String(built[key])}`);
      const { built: plain } = await build({ ...defaultNode(type as ComponentType), id: 'p' });
      for (const flag of ['massOverridden', 'cgOverridden', 'cdOverridden'])
        if (plain[flag] !== false) misses.push(`${type}.${flag} with no override: kernel ${String(plain[flag])}`);
    }
    expect(misses).toEqual([]);
  });

  it('for every material name and density the part carries', async () => {
    const misses: string[] = [];
    let compared = 0;
    for (const type of Object.keys(FIELDS).filter((t) => t !== 'stage')) {
      const keys = type === 'shockcord' ? SHOCK_CORD_KEYS : MATERIAL_KEYS;
      const base = { ...defaultNode(type as ComponentType), id: 'p' } as ComponentNode;
      const { built: probe } = await build(base);
      // Recovery devices report the surface material under `materialName`.
      const recovery = type === 'parachute' || type === 'streamer';
      const carried = keys.filter(
        ([nName, , kName]) =>
          kName in probe &&
          (kName !== 'materialName' || (nName === 'surfaceMaterialName') === recovery || type === 'shockcord'),
      );
      for (const [nName, nDensity, kName, kDensity] of carried) {
        const { app, built } = await build({ ...base, [nName]: 'Test stock', [nDensity]: 777 } as ComponentNode);
        compared++;
        if (built[kName] !== app[nName])
          misses.push(`${type}.${nName}: app ${String(app[nName])}, kernel ${String(built[kName])}`);
        if (!agrees(app[nDensity], built[kDensity], false))
          misses.push(`${type}.${nDensity}: app ${String(app[nDensity])}, kernel ${String(built[kDensity])}`);
      }
    }
    expect(misses).toEqual([]);
    expect(compared).toBeGreaterThan(15);
  });
});
