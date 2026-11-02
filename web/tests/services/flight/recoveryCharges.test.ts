import { describe, expect, it } from 'vitest';
import {
  CHARGE_TYPE,
  chargeName,
  chargeRows,
  deviceRoles,
  parseChargeName,
  recoveryCharges,
  withCharges,
} from '../../../src/services/flight/recoveryCharges';
import { findNode, MAIN_DEVICE_KEY } from '../../../src/services/design/treeEdit';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';

const tube = (id: string, name: string, children: ComponentNode[] = []) =>
  ({ id, type: 'bodytube', name, length: 0.5, outerRadius: 0.04, children }) as unknown as ComponentNode;

const rocket = (...tubes: ComponentNode[]) =>
  ({ components: [{ id: 'st', type: 'stage', children: tubes }] }) as unknown as RocketTree;

const mass = (id: string, name: string, kg: number, type?: string) =>
  ({
    id,
    type: 'masscomponent',
    name,
    mass: kg,
    ...(type ? { massComponentType: type } : {}),
  }) as unknown as ComponentNode;

describe('a charge from its name', () => {
  it.each([
    ['Main charge', 'main', false],
    ['Drogue backup charge', 'drogue', true],
    ['main BP charge (backup)', 'main', true],
  ])('reads %s', (name, role, backup) => {
    expect(parseChargeName(name)).toEqual({ role, backup });
  });

  it('needs "charge" unless the mass object is typed as a deployment charge', () => {
    expect(parseChargeName('Main')).toBeNull();
    expect(parseChargeName('Main', true)).toEqual({ role: 'main', backup: false });
    expect(parseChargeName('Ejection charge')).toBeNull();
    expect(parseChargeName('Altimeter', true)).toBeNull();
  });
});

describe('the charges a design carries', () => {
  const tree = rocket(
    tube('upper', 'Upper', [mass('m1', 'Main charge', 0.0012), mass('m2', 'Main backup', 0.0018, CHARGE_TYPE)]),
    tube('lower', 'Lower', [mass('d1', 'Drogue charge', 0.0008), mass('x', 'Nose weight', 0.02)]),
  );

  it('finds each by name and type, with its tube', () => {
    expect(recoveryCharges(tree).map((c) => [c.nodeId, c.role, c.backup, c.tubeName])).toEqual([
      ['m1', 'main', false, 'Upper'],
      ['m2', 'main', true, 'Upper'],
      ['d1', 'drogue', false, 'Lower'],
    ]);
  });

  it('lists them by bay, drogue first, with a missing backup as null', () => {
    expect(chargeRows(tree)).toEqual([
      { role: 'drogue', tubeId: 'lower', tubeName: 'Lower', stageName: '', primaryKg: 0.0008, backupKg: null },
      { role: 'main', tubeId: 'upper', tubeName: 'Upper', stageName: '', primaryKg: 0.0012, backupKg: 0.0018 },
    ]);
  });

  it("takes each device's role from its stage's plan", () => {
    const chute = (id: string, extra: Record<string, unknown> = {}) =>
      ({ id, type: 'parachute', ...extra }) as unknown as ComponentNode;
    const stage = (...devices: ComponentNode[]) => rocket(tube('t', 'T', devices));
    // Single deployment: every device is a main.
    expect([...deviceRoles(stage(chute('a'), chute('b')))]).toEqual([
      ['a', 'main'],
      ['b', 'main'],
    ]);
    // Dual: the drogue, the first other device as the main, and no role for a third.
    expect([...deviceRoles(stage(chute('a'), chute('d', { drogue: true }), chute('c')))]).toEqual([
      ['a', 'main'],
      ['d', 'drogue'],
    ]);
    // ...unless the third is picked as the main.
    expect([
      ...deviceRoles(stage(chute('a'), chute('d', { drogue: true }), chute('c', { [MAIN_DEVICE_KEY]: true }))),
    ]).toEqual([
      ['d', 'drogue'],
      ['c', 'main'],
    ]);
  });
});

describe('saving charges to a design', () => {
  it('adds both as deployment-charge mass objects in the bay', () => {
    const next = withCharges(rocket(tube('upper', 'Upper')), 'upper', 'main', 0.0012, 0.0018);
    const added = findNode(next, 'upper')!.children!;
    expect(added.map((c) => [c.name, c['mass'], c['massComponentType']])).toEqual([
      [chargeName('main', false), 0.0012, CHARGE_TYPE],
      [chargeName('main', true), 0.0018, CHARGE_TYPE],
    ]);
  });

  it('changes an existing charge where it is, typing one found by name alone', () => {
    const start = rocket(
      tube('upper', 'Upper', [
        { id: 'holder', type: 'innertube', children: [mass('m1', 'Main charge', 0.001)] } as unknown as ComponentNode,
      ]),
    );
    const next = withCharges(start, 'upper', 'main', 0.0015, null);
    const m1 = findNode(next, 'm1')!;
    expect(m1['mass']).toBe(0.0015);
    expect(m1['massComponentType']).toBe(CHARGE_TYPE);
    // Changed inside the inner tube it was kept in, not added beside it.
    expect(findNode(next, 'upper')!.children!.map((c) => c.id)).toEqual(['holder']);
  });

  it("leaves another bay's charges of the same role alone", () => {
    const start = rocket(tube('upper', 'Upper', [mass('m1', 'Main charge', 0.001)]), tube('other', 'Other'));
    const next = withCharges(start, 'other', 'main', 0.0015, 0.002);
    expect(findNode(next, 'm1')!['mass']).toBe(0.001);
    expect(chargeRows(next)).toEqual([
      { role: 'main', tubeId: 'upper', tubeName: 'Upper', stageName: '', primaryKg: 0.001, backupKg: null },
      { role: 'main', tubeId: 'other', tubeName: 'Other', stageName: '', primaryKg: 0.0015, backupKg: 0.002 },
    ]);
  });

  it('removes a charge set to nothing, and leaves an unchanged design the same object', () => {
    const typed = rocket(tube('upper', 'Upper', [mass('m1', 'Main charge', 0.001, CHARGE_TYPE)]));
    expect(withCharges(typed, 'upper', 'main', 0.001, null)).toBe(typed);
    expect(recoveryCharges(withCharges(typed, 'upper', 'main', null, null))).toEqual([]);
  });
});
