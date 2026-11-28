import { describe, expect, it } from 'vitest';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import {
  BASE_DRAG_HACK_ID,
  engineTree,
  liftBaseDragHack,
  withoutIgnored,
  withBaseDragHack,
} from '../../../src/services/design/engineTree';
import { flightKey } from '../../../src/services/flight/simulations';

const tube = (extra: Partial<ComponentNode> = {}): ComponentNode => ({
  type: 'bodytube',
  id: 'b',
  length: 0.3,
  outerRadius: 0.02,
  children: [{ type: 'masscomponent', id: 'm', mass: 0.01 }],
  ...extra,
});

const design = (parts: ComponentNode[], extra: Partial<RocketTree> = {}): RocketTree => ({
  components: [{ type: 'stage', id: 's', children: [{ type: 'nosecone', id: 'n', aftRadius: 0.02 }, ...parts] }],
  ...extra,
});

const aftParts = (t: RocketTree) => t.components.at(-1)!.children!;

describe('ignored parts', () => {
  it('leaves an ignored part and what is inside it out, and keeps the same array when nothing is ignored', () => {
    const plain = design([tube()]);
    expect(withoutIgnored(plain.components)).toBe(plain.components);
    const ignored = design([tube({ ignored: true })]);
    expect(aftParts({ components: withoutIgnored(ignored.components) }).map((n) => n.id)).toEqual(['n']);
    const inner = design([tube({ children: [{ type: 'masscomponent', id: 'm', ignored: true }] })]);
    expect(aftParts({ components: withoutIgnored(inner.components) })[1]!.children).toEqual([]);
  });

  it('never leaves out a stage', () => {
    const t: RocketTree = { components: [{ type: 'stage', id: 's', ignored: true, children: [tube()] }] };
    expect(withoutIgnored(t.components)).toBe(t.components);
  });

  it('changes the flight key, so results go outdated, and back again when cleared', () => {
    const base = design([tube()]);
    const ignored = design([tube({ ignored: true })]);
    const cleared = design([tube({ ignored: undefined })]);
    expect(flightKey(ignored)).not.toBe(flightKey(base));
    expect(flightKey(cleared)).toBe(flightKey(base));
  });
});

describe('the base drag hack', () => {
  it('adds a massless, dragless cone, tip forward and π calibers long, behind the last stage only for static builds', () => {
    const t = design([tube()], { baseDragHack: true });
    const cone = aftParts(engineTree(t, 'static')).at(-1)!;
    expect(cone).toMatchObject({
      id: BASE_DRAG_HACK_ID,
      type: 'nosecone',
      shape: 'conical',
      aftRadius: 0.02,
      length: 0.04 * Math.PI,
      overrideCD: 0,
      overrideMass: 0,
    });
    expect(cone['flipped']).toBeUndefined();
    expect(aftParts(engineTree(t, 'flight')).map((n) => n.id)).toEqual(['n', 'b']);
  });

  it('adds nothing without the flag, and sizes to the last part that is not ignored', () => {
    expect(withBaseDragHack(design([tube()]), 'x')).toEqual(design([tube()]));
    const t = design([tube(), tube({ id: 'wide', outerRadius: 0.05, ignored: true })], { baseDragHack: true });
    expect(aftParts(engineTree(t, 'static')).at(-1)).toMatchObject({ aftRadius: 0.02 });
  });

  it('does not change the flight key', () => {
    expect(flightKey(design([tube()], { baseDragHack: true }))).toBe(flightKey(design([tube()])));
  });

  it('lifts the cone it writes back off a loaded tree as the flag', () => {
    const saved = withBaseDragHack(design([tube()], { baseDragHack: true }), 'Base drag hack');
    const loaded = liftBaseDragHack({ ...saved, baseDragHack: undefined });
    expect(loaded.baseDragHack).toBe(true);
    expect(aftParts(loaded).map((n) => n.id)).toEqual(['n', 'b']);
  });

  // The tube in front is 0.02 m in radius: a hack cone is 0.02 m at its wide end and π × 0.04 m long.
  const piLong = Math.PI * 0.04;

  it('lifts a hand-made one: a point at one end, the body width at the other, π diameters long', () => {
    for (const flipped of [false, true]) {
      const t = design([tube(), { type: 'nosecone', id: 'c', aftRadius: 0.02, length: piLong, mass: 0.1, flipped }]);
      expect(liftBaseDragHack(t).baseDragHack).toBe(true);
    }
    for (const ends of [
      { foreRadius: 0, aftRadius: 0.02 },
      { foreRadius: 0.02, aftRadius: 0 },
    ]) {
      const t = design([tube(), { type: 'transition', id: 'c', length: piLong, ...ends }]);
      expect(liftBaseDragHack(t).baseDragHack).toBe(true);
    }
    // 9.42" behind a 3" tube.
    const typed = design([tube(), { type: 'nosecone', id: 'c', aftRadius: 0.02, length: 0.1257 }]);
    expect(liftBaseDragHack(typed).baseDragHack).toBe(true);
  });

  it('leaves a cone of another length or width, a boattail, or a nose-only design alone', () => {
    const others: ComponentNode[] = [
      { type: 'nosecone', id: 'c', aftRadius: 0.02, length: 0.08 },
      { type: 'nosecone', id: 'c', aftRadius: 0.015, length: piLong },
      { type: 'transition', id: 't', foreRadius: 0.02, aftRadius: 0.015, length: piLong },
    ];
    for (const other of others) {
      const t = design([tube(), other]);
      expect(liftBaseDragHack(t)).toBe(t);
    }
    const onlyNose: RocketTree = {
      components: [
        { type: 'stage', id: 's', children: [{ type: 'nosecone', id: 'n', aftRadius: 0.02, length: piLong }] },
      ],
    };
    expect(liftBaseDragHack(onlyNose)).toBe(onlyNose);
  });
});
