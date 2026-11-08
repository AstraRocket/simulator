// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import { syncAutoRadii } from '../../../src/services/design/autoRadius';
import { KERNEL_AUTO_RADIUS, KERNEL_BODYTUBE_OUTER_RADIUS } from '../../../src/tree/kernelDefaults';
import {
  addChild,
  addPart,
  catalogPatch,
  defaultNode,
  findNode,
  updateNode,
} from '../../../src/services/design/treeEdit';
import { importOrk, exportOrk } from '../../../src/services/files/orkFile';

const stage = (children: ComponentNode[]) =>
  ({ name: 'T', components: [{ type: 'stage', name: 'S', children }] }) as unknown as RocketTree;

const chainOf = (t: RocketTree) => (t.components[0] as unknown as { children: ComponentNode[] }).children;

const tube = (id: string, outerRadius: number) =>
  ({ type: 'bodytube', id, length: 0.3, outerRadius, thickness: 0.001 }) as unknown as ComponentNode;

describe('syncAutoRadii', () => {
  it('takes a body tube diameter from the part behind it', () => {
    const t = syncAutoRadii(
      stage([
        { type: 'nosecone', id: 'n', length: 0.1, aftRadius: 0.025 } as unknown as ComponentNode,
        { type: 'bodytube', id: 'b', length: 0.3, outerRadiusAuto: true } as unknown as ComponentNode,
      ]),
    );
    expect(chainOf(t)[1]!['outerRadius']).toBeCloseTo(0.025, 9);
  });

  it('looks ahead when there is nothing behind', () => {
    const t = syncAutoRadii(
      stage([
        { type: 'bodytube', id: 'b', length: 0.3, outerRadiusAuto: true } as unknown as ComponentNode,
        tube('c', 0.019),
      ]),
    );
    expect(chainOf(t)[0]!['outerRadius']).toBeCloseTo(0.019, 9);
  });

  it('reads the END that faces it, which only a transition can prove', () => {
    const t = syncAutoRadii(
      stage([
        {
          type: 'transition',
          id: 'tr',
          length: 0.05,
          foreRadius: 0.01,
          aftRadius: 0.03,
        } as unknown as ComponentNode,
        { type: 'bodytube', id: 'b', length: 0.3, outerRadiusAuto: true } as unknown as ComponentNode,
      ]),
    );
    expect(chainOf(t)[1]!['outerRadius']).toBeCloseTo(0.03, 9);
  });

  it('gives a transition each end its own neighbor', () => {
    const t = syncAutoRadii(
      stage([
        tube('a', 0.026),
        {
          type: 'transition',
          id: 'tr',
          length: 0.05,
          foreRadiusAuto: true,
          aftRadiusAuto: true,
        } as unknown as ComponentNode,
        tube('b', 0.014),
      ]),
    );
    const tr = chainOf(t)[1]!;
    expect(tr['foreRadius']).toBeCloseTo(0.026, 9);
    expect(tr['aftRadius']).toBeCloseTo(0.014, 9);
  });

  it('falls back to the kernel default radius when two automatic tubes only have each other', () => {
    // BodyTube.getAutoOuterRadius falls back to SymmetricComponent.DEFAULT_RADIUS.
    const t = syncAutoRadii(
      stage([
        { type: 'bodytube', id: 'a', length: 0.3, outerRadiusAuto: true } as unknown as ComponentNode,
        { type: 'bodytube', id: 'b', length: 0.3, outerRadiusAuto: true } as unknown as ComponentNode,
      ]),
    );
    for (const n of chainOf(t)) expect(n['outerRadius']).toBeCloseTo(0.025, 12);
    expect(KERNEL_AUTO_RADIUS).toBe(0.025);
  });

  it('chains through an automatic tube to the part beyond it', () => {
    const t = syncAutoRadii(
      stage([
        { type: 'nosecone', id: 'n', length: 0.1, aftRadius: 0.031 } as unknown as ComponentNode,
        { type: 'bodytube', id: 'a', length: 0.3, outerRadiusAuto: true } as unknown as ComponentNode,
        { type: 'bodytube', id: 'b', length: 0.3, outerRadiusAuto: true } as unknown as ComponentNode,
      ]),
    );
    expect(chainOf(t)[1]!['outerRadius']).toBeCloseTo(0.031, 12);
    expect(chainOf(t)[2]!['outerRadius']).toBeCloseTo(0.031, 12);
  });

  it('treats a transition end with no radius as automatic, as the bridge builds it', () => {
    const t = syncAutoRadii(
      stage([
        tube('a', 0.02),
        { type: 'transition', id: 'tr', length: 0.05 } as unknown as ComponentNode,
        tube('b', 0.03),
      ]),
    );
    const tr = chainOf(t)[1]!;
    expect(tr['foreRadius']).toBeCloseTo(0.02, 12);
    expect(tr['aftRadius']).toBeCloseTo(0.03, 12);
    expect(tr['foreRadiusAuto']).toBe(true);
    expect(tr['aftRadiusAuto']).toBe(true);
  });

  it('follows the part across a stage boundary', () => {
    const t = {
      name: 'T',
      components: [
        {
          type: 'stage',
          name: 'S',
          children: [
            {
              type: 'transition',
              id: 'tr',
              length: 0.05,
              foreRadius: 0.02,
              aftRadius: 0.01,
              aftRadiusAuto: true,
            },
          ],
        },
        { type: 'stage', name: 'B', children: [tube('booster', 0.033)] },
      ],
    } as unknown as RocketTree;
    expect(chainOf(syncAutoRadii(t))[0]!['aftRadius']).toBeCloseTo(0.033, 12);
  });

  it('sizes a flipped nose cone base from the part ahead of it', () => {
    // A flipped nose cone is a tail cone: its base is the fore end.
    const t = syncAutoRadii(
      stage([
        { type: 'nosecone', id: 'n', length: 0.1, aftRadius: 0.02 } as unknown as ComponentNode,
        tube('b', 0.027),
        {
          type: 'nosecone',
          id: 'tail',
          length: 0.05,
          aftRadius: 0.01,
          aftRadiusAuto: true,
          flipped: true,
        } as unknown as ComponentNode,
      ]),
    );
    expect(chainOf(t)[2]!['aftRadius']).toBeCloseTo(0.027, 12);
  });

  it('touches nothing without the flag', () => {
    const before = stage([tube('a', 0.026), tube('b', 0.014)]);
    expect(syncAutoRadii(before)).toBe(before);
  });

  it('sizes a body tube or transition added from the menu to the part ahead of it', () => {
    const nose = { type: 'nosecone', id: 'n', length: 0.15, aftRadius: 0.027 } as unknown as ComponentNode;
    const design = {
      name: 'T',
      components: [{ type: 'stage', id: 's', name: 'S', children: [nose] }],
    } as unknown as RocketTree;
    let t = addPart(design, 'bodytube', null).tree;
    expect(chainOf(t)[1]!['outerRadius']).toBeCloseTo(0.027, 12);
    t = addPart(t, 'transition', null).tree;
    expect(chainOf(t)[2]!['foreRadius']).toBeCloseTo(0.027, 12);
  });

  it('follows the neighbor through an edit', () => {
    let t = syncAutoRadii(
      stage([
        { type: 'nosecone', id: 'n', length: 0.1, aftRadius: 0.025 } as unknown as ComponentNode,
        { type: 'bodytube', id: 'b', length: 0.3, outerRadiusAuto: true } as unknown as ComponentNode,
      ]),
    );
    t = updateNode(t, 'n', { aftRadius: 0.031 });
    expect(chainOf(t)[1]!['outerRadius']).toBeCloseTo(0.031, 9);
  });
});

describe('the neighbor an automatic tube remembers', () => {
  type Part = Record<string, unknown>;
  const stages = (...rows: Part[][]) =>
    ({
      name: 'T',
      components: rows.map((children, k) => ({ type: 'stage', id: `s${k}`, name: `S${k}`, children })),
    }) as unknown as RocketTree;
  const at = { method: 'top', offset: 0 };
  const autoNose = { type: 'nosecone', id: 'n', length: 0.1, aftRadius: 0.02, aftRadiusAuto: true, thickness: 0.002 };
  const auto = (id: string, children: Part[] = []): Part => ({
    type: 'bodytube',
    id,
    length: 0.3,
    outerRadius: 0.02,
    outerRadiusAuto: true,
    thickness: 0.001,
    children,
  });
  const fixed = (id: string, outerRadius: number): Part => ({
    type: 'bodytube',
    id,
    length: 0.3,
    outerRadius,
    thickness: 0.001,
  });
  const coupler = (id: string): Part => ({
    type: 'tubecoupler',
    id,
    length: 0.05,
    thickness: 0.001,
    outerRadius: 0.01,
    outerRadiusAuto: true,
    position: at,
  });
  const fins = (id: string, tabbed: boolean): Part => ({
    type: 'trapezoidfinset',
    id,
    finCount: 3,
    rootChord: 0.05,
    tipChord: 0.03,
    sweep: 0.01,
    height: 0.05,
    thickness: 0.003,
    ...(tabbed ? { tabHeight: 0.2, tabLength: 0.02, tabOffsetMethod: 'middle', tabOffset: 0 } : {}),
    position: at,
  });
  const lug: Part = { type: 'launchlug', id: 'lug', length: 0.05, outerRadius: 0.003, thickness: 0.0003, position: at };

  const radii = (t: RocketTree): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const s of t.components) {
      for (const n of s.children ?? []) {
        out[n.id!] = n.type === 'bodytube' ? (n['outerRadius'] as number) : (n['aftRadius'] as number);
      }
    }
    return out;
  };

  it('takes the fixed tube even where a neighbor remembered the tube from the build', () => {
    // The coupler evaluates b mid-build, so b remembers a until the settle pass.
    const t = syncAutoRadii(stages([autoNose, auto('a'), auto('b', [coupler('cp')])], [fixed('c', 0.0237)]));
    expect(radii(t)).toEqual({ n: 0.0237, a: 0.0237, b: 0.0237, c: 0.0237 });
  });

  it('flies the dual-parachute-deployment airframe at the radius desktop flies', () => {
    const t = syncAutoRadii(
      stages([
        { ...autoNose, aftRadius: 0.028321 },
        { ...fixed('t1', 0.025), outerRadiusAuto: true },
        { ...fixed('t2', 0.028321), outerRadiusAuto: true, children: [coupler('t2c')] },
        fixed('t3', 0.028321),
        { ...fixed('t4', 0.028321), outerRadiusAuto: true },
      ]),
    );
    expect(radii(t)).toEqual({ n: 0.028321, t1: 0.028321, t2: 0.028321, t3: 0.028321, t4: 0.028321 });
  });

  it('settles a run of eight automatic tubes, each with an automatic coupler', () => {
    const run = Array.from({ length: 8 }, (_, i) => auto(`r${i}`, [coupler(`rc${i}`)]));
    const r = radii(syncAutoRadii(stages([autoNose, ...run, fixed('end', 0.0237)])));
    expect(Array.from({ length: 8 }, (_, i) => r[`r${i}`])).toEqual(Array(8).fill(0.0237));
  });

  it('takes the fixed tube when nothing evaluates a tube during the build', () => {
    const t = syncAutoRadii(stages([autoNose, auto('a'), auto('b')], [fixed('c', 0.0237)]));
    expect(radii(t)).toEqual({ n: 0.0237, a: 0.0237, b: 0.0237, c: 0.0237 });
  });

  it('takes the fixed tube when a fin set re-evaluates the tube after the build', () => {
    const t = syncAutoRadii(stages([autoNose, auto('a'), auto('b', [fins('f', true)])], [fixed('c', 0.0237)]));
    expect(radii(t)).toEqual({ n: 0.0237, a: 0.0237, b: 0.0237, c: 0.0237 });
  });

  it('takes the fixed tube when a launch lug re-evaluates the tube after the build', () => {
    const t = syncAutoRadii(stages([autoNose, auto('a'), auto('b', [coupler('cp'), lug])], [fixed('c', 0.0237)]));
    expect(radii(t)).toEqual({ n: 0.0237, a: 0.0237, b: 0.0237, c: 0.0237 });
  });

  it('takes the fixed tube for every tube in a run built with couplers', () => {
    const t = syncAutoRadii(
      stages([
        autoNose,
        auto('a', [coupler('c1')]),
        auto('b', [coupler('c2')]),
        auto('c', [coupler('c3')]),
        fixed('d', 0.0237),
      ]),
    );
    expect(radii(t)).toEqual({ n: 0.0237, a: 0.0237, b: 0.0237, c: 0.0237, d: 0.0237 });
  });

  it('settles a long run of tubes with couplers and fin sets to its fixed end', () => {
    const run = Array.from({ length: 12 }, (_, i) => auto(`t${i}`, [coupler(`c${i}`), fins(`f${i}`, false)]));
    const r = radii(syncAutoRadii(stages([autoNose, ...run, fixed('end', 0.0237)])));
    expect([r['t0'], r['t1'], r['t2'], r['t11']]).toEqual([0.0237, 0.0237, 0.0237, 0.0237]);
  });

  it('takes the fixed tube with nothing ahead at all', () => {
    const t = syncAutoRadii(stages([auto('a'), auto('b', [coupler('cp')])], [fixed('c', 0.0237)]));
    expect(radii(t)).toEqual({ a: 0.0237, b: 0.0237, c: 0.0237 });
  });

  it('takes the fixed tube behind a transition whose aft end is automatic', () => {
    const t = syncAutoRadii(
      stages([
        { type: 'nosecone', id: 'n', length: 0.1, aftRadius: 0.03, thickness: 0.002 },
        {
          type: 'transition',
          id: 'tr',
          length: 0.05,
          foreRadius: 0.03,
          aftRadius: 0.01,
          aftRadiusAuto: true,
          thickness: 0.001,
        },
        auto('a'),
        auto('b', [coupler('cp')]),
        fixed('c', 0.0237),
      ]),
    );
    expect(radii(t)).toEqual({ n: 0.03, tr: 0.0237, a: 0.0237, b: 0.0237, c: 0.0237 });
  });

  it('takes the base of a flipped nose cone behind', () => {
    const t = syncAutoRadii(
      stages([
        autoNose,
        auto('a'),
        auto('b', [coupler('cp')]),
        { type: 'nosecone', id: 'tail', length: 0.1, aftRadius: 0.015, flipped: true, thickness: 0.002 },
      ]),
    );
    expect(radii(t)).toEqual({ n: 0.015, a: 0.015, b: 0.015, tail: 0.015 });
  });
});

describe('neighbors across pod sets and boosters', () => {
  type Part = Record<string, unknown>;
  const stages = (...rows: Part[][]) =>
    ({
      name: 'T',
      components: rows.map((children, k) => ({ type: 'stage', id: `s${k}`, name: `S${k}`, children })),
    }) as unknown as RocketTree;
  const nose = (aftRadius: number, extra: Part = {}): Part => ({
    type: 'nosecone',
    id: 'nose',
    length: 0.1,
    aftRadius,
    thickness: 0.002,
    ...extra,
  });
  const fixed = (id: string, outerRadius: number, children: Part[] = [], length = 0.3): Part => ({
    type: 'bodytube',
    id,
    length,
    outerRadius,
    thickness: 0.001,
    children,
  });
  const auto = (id: string, children: Part[] = [], length = 0.3): Part => ({
    ...fixed(id, 0.02, children, length),
    outerRadiusAuto: true,
  });
  const pod = (radiusMethod: string, radiusOffset: number, method: string, children: Part[], instanceCount = 2) => ({
    type: 'podset',
    id: 'pod',
    instanceCount,
    radiusMethod,
    radiusOffset,
    angleOffset: 0,
    position: { method, offset: 0 },
    children,
  });
  const radii = (t: RocketTree): Record<string, number> => {
    const out: Record<string, number> = {};
    const walk = (nodes: ComponentNode[]) => {
      for (const n of nodes) {
        if (n.type === 'bodytube') out[n.id!] = n['outerRadius'] as number;
        if (n.type === 'nosecone') out[n.id!] = n['aftRadius'] as number;
        walk(n.children ?? []);
      }
    };
    walk(t.components);
    return out;
  };
  const podTube = (method: string, offset: number, at: string) =>
    radii(syncAutoRadii(stages([nose(0.03), fixed('a', 0.02, [pod(method, offset, at, [auto('p', [], 0.1)])])])))['p'];

  it('lets the first tube of a coaxial pod follow the tube it hangs on', () => {
    expect(podTube('coaxial', 0, 'bottom')).toBe(0.02);
  });

  it('counts a free pod at no offset as in line, and at the top it follows the part ahead of its tube', () => {
    expect(podTube('free', 0, 'top')).toBe(0.03);
  });

  it('counts a pod placed against its tube at minus the tube radius as in line', () => {
    expect(podTube('relative', -0.02, 'bottom')).toBe(0.02);
  });

  // ComponentFactory builds a tube with no radius at 0.025 m.
  it('places a pod against a tube with no radius at the bridge default', () => {
    const inLine = pod('relative', -KERNEL_BODYTUBE_OUTER_RADIUS, 'bottom', [auto('p', [], 0.1)]);
    const keyless = { ...fixed('a', 0, [inLine]), outerRadius: undefined };
    expect(radii(syncAutoRadii(stages([nose(0.03), keyless])))['p']).toBe(KERNEL_BODYTUBE_OUTER_RADIUS);
  });

  it('keeps an off-axis pod apart, with nothing for its tube to follow', () => {
    expect(podTube('relative', 0, 'bottom')).toBe(KERNEL_AUTO_RADIUS);
  });

  it('takes the wider last tube of a pod flush with the aft end of the tube ahead', () => {
    const t = stages([
      nose(0.03),
      fixed('a', 0.02, [pod('coaxial', 0, 'bottom', [fixed('q', 0.035, [], 0.1)])]),
      auto('b'),
    ]);
    expect(radii(syncAutoRadii(t))['b']).toBe(0.035);
  });

  it('takes the wider first tube of a pod flush with the fore end of the tube behind', () => {
    const t = stages([
      nose(0.03, { aftRadiusAuto: true }),
      auto('a'),
      fixed('b', 0.02, [pod('coaxial', 0, 'top', [fixed('q', 0.035, [], 0.1)])]),
    ]);
    expect(radii(syncAutoRadii(t))).toMatchObject({ nose: 0.035, a: 0.035 });
  });

  it('takes the tube itself when its pod sits partway along it', () => {
    const t = stages([
      nose(0.03),
      fixed('a', 0.02, [pod('coaxial', 0, 'middle', [fixed('q', 0.035, [], 0.1)])]),
      auto('b'),
    ]);
    expect(radii(syncAutoRadii(t))['b']).toBe(0.02);
  });

  it('reaches the fixed tube past a pod set, wherever the pod is placed', () => {
    const build = (method: string, offset: number) =>
      stages(
        [auto('a')],
        [auto('b', [pod(method, offset, 'top', [fixed('p', 0.01, [], 0.1)], 3)])],
        [fixed('c', 0.0423)],
      );
    expect(radii(syncAutoRadii(build('surface', 0)))['a']).toBe(0.0423);
    expect(radii(syncAutoRadii(build('free', 0.05)))['a']).toBe(0.0423);
  });

  it("settles a pod's run of tubes whatever its copy count", () => {
    const coupler = (id: string): Part => ({
      type: 'tubecoupler',
      id,
      length: 0.05,
      thickness: 0.001,
      outerRadius: 0.01,
      outerRadiusAuto: true,
      position: { method: 'top', offset: 0 },
    });
    const fins = (id: string): Part => ({
      type: 'trapezoidfinset',
      id,
      finCount: 3,
      rootChord: 0.05,
      tipChord: 0.03,
      sweep: 0.01,
      height: 0.05,
      thickness: 0.003,
      position: { method: 'top', offset: 0 },
    });
    const run = (copies: number) =>
      radii(
        syncAutoRadii(
          stages([
            nose(0.03),
            fixed('a', 0.02, [
              pod(
                'free',
                0.05,
                'bottom',
                [
                  { ...nose(0.01, { aftRadiusAuto: true }), id: 'pn' },
                  ...Array.from({ length: 12 }, (_, i) => auto(`t${i}`, [coupler(`c${i}`), fins(`f${i}`)], 0.1)),
                  fixed('end', 0.0237, [], 0.1),
                ],
                copies,
              ),
            ]),
          ]),
        ),
      );
    const one = run(1);
    const three = run(3);
    expect([one['t0'], one['t1'], one['t2']]).toEqual([0.0237, 0.0237, 0.0237]);
    expect([three['t0'], three['t1'], three['t2']]).toEqual([0.0237, 0.0237, 0.0237]);
  });
});

describe('the automatic state through a file', () => {
  const xml = exportOrk({
    name: 'Auto',
    tree: stage([
      { type: 'nosecone', id: 'n', shape: 'ogive', length: 0.1, aftRadius: 0.025, thickness: 0.001 },
      { type: 'bodytube', id: 'b', length: 0.3, thickness: 0.001, outerRadiusAuto: true },
    ] as unknown as ComponentNode[]),
  });

  it('writes an automatic diameter as auto', () => {
    expect(xml).toContain('<radius>auto</radius>');
  });

  it('reads it back as automatic AND resolved', () => {
    const back = importOrk(xml).tree;
    const bt = chainOf(back).find((n) => n.type === 'bodytube')!;
    expect(bt['outerRadiusAuto']).toBe(true);
    expect(bt['outerRadius']).toBeCloseTo(0.025, 9);
  });
});

describe('automatic values other than the neighbor rule', () => {
  const inTube = (child: ComponentNode) =>
    ({
      name: 'T',
      components: [
        {
          type: 'stage',
          name: 'S',
          children: [
            { type: 'bodytube', id: 'b', length: 0.3, outerRadius: 0.026, thickness: 0.001, children: [child] },
          ],
        },
      ],
    }) as unknown as RocketTree;

  const kid = (t: RocketTree) =>
    ((t.components[0] as unknown as { children: ComponentNode[] }).children[0]!.children as ComponentNode[])[0]!;

  it('fills a ring to the bore of the tube it sits in', () => {
    const t = syncAutoRadii(
      inTube({ type: 'centeringring', id: 'cr', length: 0.003, outerRadiusAuto: true } as unknown as ComponentNode),
    );
    expect(kid(t)['outerRadius']).toBeCloseTo(0.025, 9);
  });

  it('gives a mass object the room its parent has', () => {
    const t = syncAutoRadii(
      inTube({
        type: 'masscomponent',
        id: 'm',
        mass: 0.02,
        length: 0.02,
        radiusAuto: true,
      } as unknown as ComponentNode),
    );
    expect(kid(t)['radius']).toBeCloseTo(0.025, 9);
  });

  it('fills a ring to the bore of an automatic coupler, not the coupler default', () => {
    const t = syncAutoRadii(
      inTube({
        type: 'tubecoupler',
        id: 'cp',
        length: 0.03,
        thickness: 0.0005,
        outerRadius: 0.0125,
        outerRadiusAuto: true,
        children: [{ type: 'bulkhead', id: 'bh', length: 0.003, outerRadius: 0.0125, outerRadiusAuto: true }],
      } as unknown as ComponentNode),
    );
    const coupler = kid(t);
    const bulkhead = (coupler.children as ComponentNode[])[0]!;
    expect(coupler['outerRadius']).toBeCloseTo(0.025, 9);
    expect(bulkhead['outerRadius']).toBeCloseTo(0.0245, 9);
  });

  it('sizes a tube fin set from the body and the fin count', () => {
    const t = syncAutoRadii(
      inTube({
        type: 'tubefinset',
        id: 'tf',
        finCount: 6,
        length: 0.1,
        outerRadiusAuto: true,
      } as unknown as ComponentNode),
    );
    // TubeFinSet.getTouchingRadius: for six tubes sin(π/6) is 1/2, so each is the body's radius.
    expect(kid(t)['outerRadius']).toBeCloseTo(0.026, 12);
  });

  it('resizes an automatic tube fin set when the body changes', () => {
    const fins = {
      type: 'tubefinset',
      id: 'tf',
      finCount: 6,
      length: 0.1,
      outerRadiusAuto: true,
    } as unknown as ComponentNode;
    const first = syncAutoRadii(inTube(fins));
    const stored = kid(first);
    expect(stored['outerRadius']).toBeCloseTo(0.026, 12);
    const wider = inTube(stored);
    wider.components[0]!.children![0]!['outerRadius'] = 0.04;
    expect(kid(syncAutoRadii(wider))['outerRadius']).toBeCloseTo(0.04, 12);
  });
});

describe('the values the kernel works out, through a file', () => {
  const chute = (extra: Record<string, unknown>) =>
    ({
      name: 'R',
      components: [
        {
          type: 'stage',
          name: 'S',
          children: [
            {
              type: 'bodytube',
              id: 'b',
              length: 0.3,
              outerRadius: 0.026,
              thickness: 0.001,
              children: [{ type: 'parachute', id: 'p', diameter: 0.4, lineCount: 6, ...extra }],
            },
          ],
        },
      ],
    }) as unknown as RocketTree;

  const find = (t: RocketTree, type: string): ComponentNode => {
    const walk = (ns: ComponentNode[]): ComponentNode | undefined => {
      for (const n of ns) {
        if (n.type === type) return n;
        const hit = walk((n.children ?? []) as ComponentNode[]);
        if (hit) return hit;
      }
      return undefined;
    };
    return walk(t.components)!;
  };

  it('keeps an automatic drag coefficient automatic', () => {
    const xml = exportOrk({ name: 'R', tree: chute({ cdAuto: true }) });
    expect(xml).toContain('<cd>auto</cd>');
    expect(find(importOrk(xml).tree, 'parachute')['cdAuto']).toBe(true);
  });

  // Desktop 24.12 reads `<linelength>auto` as its 0.3 m default, so the tag carries the flown length.
  it('keeps an automatic shroud-line length, writing the length that flies', () => {
    const tree = chute({ lineLengthAuto: true, lineLength: 0.3 });
    const id = find(tree, 'parachute').id as string;
    const xml = exportOrk({
      name: 'R',
      tree,
      componentInfo: (i) => (i === id ? { mass: 0.01, cgX: 0, lineLength: 0.45 } : undefined),
    });
    expect(xml).toContain('<linelength>0.45</linelength>');
    expect(xml).toContain('<linelengthauto>true</linelengthauto>');
    expect(xml).not.toContain('<linelength>auto</linelength>');
    expect(find(importOrk(xml).tree, 'parachute')['lineLengthAuto']).toBe(true);
  });

  it('writes a packed radius the way the desktop does, marker and value', () => {
    const xml = exportOrk({ name: 'R', tree: chute({ radiusAuto: true, radius: 0.025 }) });
    expect(xml).toMatch(/<packedradius>auto 0\.025<\/packedradius>/);
    const back = find(importOrk(xml).tree, 'parachute');
    expect(back['radiusAuto']).toBe(true);
    expect(back['radius']).toBeCloseTo(0.025, 9);
  });
});

describe('what a new part starts as', () => {
  it.each([
    ['centeringring', ['outerRadiusAuto', 'innerRadiusAuto']],
    ['bulkhead', ['outerRadiusAuto']],
    ['tubecoupler', ['outerRadiusAuto']],
    ['engineblock', ['outerRadiusAuto']],
  ] as const)('gives a new %s its automatic diameters', (type, flags) => {
    const node = defaultNode(type);
    for (const flag of flags) expect(node[flag], `${type}.${flag}`).toBe(true);
  });

  it('leaves an inner tube pinned, since the kernel sizes one to a motor', () => {
    expect(defaultNode('innertube')['outerRadiusAuto']).toBeUndefined();
  });

  it('resolves the new part against the tube it lands in, in the same edit', () => {
    const host = tube('b', 0.026);
    const { tree, id } = addPart(stage([host]), 'centeringring', 'b');
    const ring = (chainOf(tree)[0]!.children as ComponentNode[])[0]!;
    expect(ring.id).toBe(id);
    expect(ring['outerRadius']).toBeCloseTo(0.025, 9);
    expect(ring['innerRadius']).toBe(0);
  });

  it('follows the mount when there is one', () => {
    const host = { ...tube('b', 0.026), children: [] as ComponentNode[] } as unknown as ComponentNode;
    host.children = [
      {
        type: 'innertube',
        id: 'mt',
        length: 0.07,
        outerRadius: 0.0095,
        motorMount: true,
        position: { method: 'bottom', offset: 0 },
      } as unknown as ComponentNode,
    ];
    const { tree } = addPart(stage([host]), 'centeringring', 'b');
    const kids = chainOf(tree)[0]!.children as ComponentNode[];
    const ring = kids.find((n) => n.type === 'centeringring')!;
    expect(ring['innerRadius']).toBeCloseTo(0.0095, 9);
  });

  it('is a solid disc where no mount runs through it, and takes the widest mount that does', () => {
    const mount = (id: string, r: number, at: number) =>
      ({
        type: 'innertube',
        id,
        length: 0.07,
        outerRadius: r,
        position: { method: 'top', offset: at },
      }) as unknown as ComponentNode;
    const ring = (id: string, at: number) =>
      ({
        type: 'centeringring',
        id,
        length: 0.005,
        outerRadiusAuto: true,
        innerRadiusAuto: true,
        position: { method: 'top', offset: at },
      }) as unknown as ComponentNode;
    const host = {
      ...tube('b', 0.026),
      children: [mount('small', 0.006, 0), mount('wide', 0.0095, 0.03), ring('stop', 0.2), ring('both', 0.05)],
    } as unknown as ComponentNode;
    const kids = chainOf(syncAutoRadii(stage([host])))[0]!.children as ComponentNode[];
    expect(kids.find((n) => n.id === 'stop')!['innerRadius']).toBe(0);
    expect(kids.find((n) => n.id === 'both')!['innerRadius']).toBeCloseTo(0.0095, 12);
  });

  it('resolves a ring with no bore of its own as an automatic one', () => {
    const mount = (id: string, r: number, at: number) =>
      ({
        type: 'innertube',
        id,
        length: 0.07,
        outerRadius: r,
        position: { method: 'top', offset: at },
      }) as ComponentNode;
    const ring = {
      type: 'centeringring',
      id: 'r',
      length: 0.005,
      outerRadius: 0.025,
      position: { method: 'top', offset: 0.05 },
    };
    const host = {
      ...tube('b', 0.026),
      children: [mount('small', 0.006, 0), mount('wide', 0.0095, 0.03), ring],
    } as unknown as ComponentNode;
    const kids = chainOf(syncAutoRadii(stage([host])))[0]!.children as ComponentNode[];
    expect(kids.find((n) => n.id === 'r')!['innerRadius']).toBeCloseTo(0.0095, 12);
  });
});

describe('applying a catalog part', () => {
  // 40 mm, not the 50 mm bore, so pinned and overwritten give different answers.
  const row = (over: Record<string, unknown>) =>
    ({ type: 'centeringring', outerDiameter: 0.04, innerDiameter: 0.029, length: 0.003, ...over }) as never;

  it('turns the automatic flag off for each diameter it states', () => {
    const patch = catalogPatch(row({}));
    expect(patch['outerRadiusAuto']).toBe(false);
    expect(patch['innerRadiusAuto']).toBe(false);
  });

  it('survives the resolver it would otherwise lose to', () => {
    const { tree, id } = addPart(stage([tube('b', 0.026)]), 'centeringring', 'b');
    const picked = updateNode(tree, id, catalogPatch(row({})));
    const ring = (chainOf(syncAutoRadii(picked))[0]!.children as ComponentNode[])[0]!;
    expect(ring['outerRadius']).toBeCloseTo(0.02, 9);
    expect(ring['innerRadius']).toBeCloseTo(0.0145, 9);
  });
});

describe("a tube fin set's wall", () => {
  const tree = {
    name: 'T',
    components: [
      {
        type: 'stage',
        id: 's',
        children: [{ type: 'bodytube', id: 'b', length: 0.3, outerRadius: 0.02, thickness: 0.0005, children: [] }],
      },
    ],
  } as unknown as RocketTree;
  const fins = (t: RocketTree) => findNode(t, 'f')!;

  it("takes the tube's wall when it is added, and keeps it when the tube changes", () => {
    const added = addChild(tree, 'b', { type: 'tubefinset', id: 'f', length: 0.05 } as unknown as ComponentNode);
    expect(fins(added)['thickness']).toBe(0.0005);
    expect(fins(updateNode(added, 'b', { thickness: 0.002 }))['thickness']).toBe(0.0005);
  });
});
