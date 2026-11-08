// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  BAYS_KEY,
  bayRecord,
  designBays,
  effectiveBay,
  isTubeBays,
  updateBay,
  type GroundTest,
} from '../../../src/services/flight/recoveryBays';
import { recoveryCharges } from '../../../src/services/flight/recoveryCharges';
import { DEFAULT_BAY_PRESSURE_PA } from '../../../src/services/flight/ejectionCharge';
import { PIN_STRENGTH_N } from '../../../src/services/flight/ejectionBay';
import { flightKey } from '../../../src/services/flight/simulations';
import { importOrk } from '../../../src/services/files/orkFile';
import { exportOrk } from '../../../src/services/files/orkExport';
import { bayCopyOf, restoreBays } from '../../../src/services/storage/bayStore';
import { findNode, MAIN_DEVICE_KEY, setStageMain } from '../../../src/services/design/treeEdit';
import { walkNodes } from '../../../src/tree/treeWalk';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';

const at = (offset: number) => ({ method: 'top', offset });

function rocket(): RocketTree {
  return {
    name: 'R',
    components: [
      {
        id: 'st',
        type: 'stage',
        name: 'Sustainer',
        children: [
          {
            id: 'upper',
            type: 'bodytube',
            name: 'Upper',
            length: 0.6,
            outerRadius: 0.04,
            thickness: 0.001,
            children: [{ id: 'main', type: 'parachute', name: 'Main', length: 0.05, position: at(0.1) }],
          },
          {
            id: 'lower',
            type: 'bodytube',
            name: 'Lower',
            length: 0.5,
            outerRadius: 0.04,
            thickness: 0.001,
            children: [
              { id: 'drogue', type: 'parachute', name: 'Drogue', drogue: true, length: 0.05, position: at(0.1) },
              { id: 'streamer', type: 'streamer', name: 'Streamer', drogue: true, length: 0.05, position: at(0.2) },
            ],
          },
        ],
      },
    ],
  } as unknown as RocketTree;
}

const test1: GroundTest = {
  id: 't1',
  date: '2026-10-30',
  chargeKg: 0.0012,
  pins: { count: 3, size: '2-56', forceN: PIN_STRENGTH_N['2-56'] },
  result: 'clean',
  notes: 'Chute out, no damage',
};

describe("a design's recovery bays", () => {
  it('lists one bay per tube and role, with the devices in it', () => {
    expect(designBays(rocket()).map((b) => [b.tubeName, b.role, b.devices])).toEqual([
      ['Upper', 'main', ['Main']],
      ['Lower', 'drogue', ['Drogue', 'Streamer']],
    ]);
  });

  it("gives no bay to a dual-deployment stage's device beyond its drogue and main", () => {
    const tree = rocket();
    const lower = findNode(tree, 'lower')!;
    lower.children = lower.children!.filter((c) => c.id !== 'streamer');
    findNode(tree, 'upper')!.children!.push({
      id: 'nose',
      type: 'streamer',
      name: 'Nose streamer',
      length: 0.05,
      position: at(0.3),
    } as never);
    expect(designBays(tree).map((b) => [b.tubeName, b.role, b.devices])).toEqual([
      ['Upper', 'main', ['Main']],
      ['Lower', 'drogue', ['Drogue']],
    ]);
    const picked = setStageMain(tree, 'st', 'nose');
    expect(designBays(picked).map((b) => [b.tubeName, b.role, b.devices])).toEqual([
      ['Upper', 'main', ['Nose streamer']],
      ['Lower', 'drogue', ['Drogue']],
    ]);
    expect(flightKey(picked)).toBe(flightKey(tree));
  });

  it("takes each setting from the record where it has one, else the design's", () => {
    const [main] = designBays(rocket());
    const drawn = effectiveBay(main!);
    expect(drawn.pressurePa).toBe(DEFAULT_BAY_PRESSURE_PA);
    expect(drawn.pinSource).toBe('default');
    const tree = updateBay(rocket(), 'upper', 'main', {
      lengthM: 0.3,
      pins: { count: 4, size: '4-40', forceN: PIN_STRENGTH_N['4-40'] },
    });
    const set = effectiveBay(designBays(tree)[0]!);
    expect(set.lengthM).toBe(0.3);
    expect(set.boreM).toBeCloseTo(0.078, 12);
    expect(set.pins.count).toBe(4);
    expect(set.pinSource).toBe('bay');
  });
});

describe('updating a bay', () => {
  it('keeps the record on the tube, drops keys set to undefined, and logs tests', () => {
    let tree = updateBay(rocket(), 'lower', 'drogue', { pressurePa: 90000, tests: [test1] });
    expect(bayRecord(tree, 'lower', 'drogue')).toEqual({ pressurePa: 90000, tests: [test1] });
    tree = updateBay(tree, 'lower', 'drogue', { pressurePa: undefined });
    expect(bayRecord(tree, 'lower', 'drogue')).toEqual({ tests: [test1] });
    expect(findNode(tree, 'upper')![BAYS_KEY]).toBeUndefined();
  });

  it('writes the flight charges to deployment-charge mass objects in the bay', () => {
    const tree = updateBay(rocket(), 'lower', 'drogue', { primaryKg: 0.0012, backupKg: 0.0018, flownTestId: 't1' });
    expect(recoveryCharges(tree).map((c) => [c.role, c.backup, c.massKg, c.tubeName])).toEqual([
      ['drogue', false, 0.0012, 'Lower'],
      ['drogue', true, 0.0018, 'Lower'],
    ]);
  });

  it('ages no simulation result, since nothing in a record flies', () => {
    const before = rocket();
    const after = updateBay(before, 'upper', 'main', { tests: [test1], pressurePa: 90000 });
    expect(flightKey(after)).toBe(flightKey(before));
  });
});

describe("a record's shape", () => {
  it('accepts a well-formed record and refuses anything else', () => {
    expect(isTubeBays({ main: { tests: [test1] } })).toBe(true);
    expect(isTubeBays({ main: { tests: [{ ...test1, result: 'exploded' }] } })).toBe(false);
    expect(isTubeBays({ booster: { tests: [] } })).toBe(false);
    expect(isTubeBays({ main: { tests: [], pressurePa: -1 } })).toBe(false);
    expect(isTubeBays([])).toBe(false);
  });
});

describe('the records in a .ork', () => {
  it('round-trip inside the tube they belong to', () => {
    const tree = updateBay(rocket(), 'lower', 'drogue', { primaryKg: 0.0012, tests: [test1] });
    const xml = exportOrk({ name: 'R', tree } as never);
    expect(xml).toContain('<astrarocketbays>');
    const back = importOrk(xml).tree;
    const lower = [...walkNodes(back.components)].find((n) => n.type === 'bodytube' && n.name === 'Lower')!;
    expect(lower[BAYS_KEY]).toEqual({ drogue: { primaryKg: 0.0012, tests: [test1] } });
    expect(lower['xmlExtra']).toBeUndefined();
  });

  it("carry a stage's picked main inside the device", () => {
    const tree = setStageMain(rocket(), 'st', 'main');
    const xml = exportOrk({ name: 'R', tree } as never);
    expect(xml).toContain('<astrarocketmain>true</astrarocketmain>');
    const back = [...walkNodes(importOrk(xml).tree.components)];
    expect(back.find((n) => n.name === 'Main')![MAIN_DEVICE_KEY]).toBe(true);
    expect(back.find((n) => n.name === 'Main')!['xmlExtra']).toBeUndefined();
    expect(back.find((n) => n.name === 'Drogue')![MAIN_DEVICE_KEY]).toBeUndefined();
  });

  it('drops a malformed record rather than loading it', () => {
    const xml = exportOrk({ name: 'R', tree: rocket() } as never).replace(
      '<name>Lower</name>',
      '<name>Lower</name><astrarocketbays>{"drogue":{"tests":"no"}}</astrarocketbays>',
    );
    const lower = [...walkNodes(importOrk(xml).tree.components)].find((n) => n.name === 'Lower')!;
    expect(lower[BAYS_KEY]).toBeUndefined();
  });
});

describe("the browser's copy", () => {
  it('puts the records back on the tubes that match, and only where a tube has none', () => {
    const kept = updateBay(rocket(), 'lower', 'drogue', { tests: [test1] });
    const copy = bayCopyOf(kept);
    const { tree, restored } = restoreBays(rocket(), copy);
    expect(restored).toBe(1);
    expect(bayRecord(tree, 'lower', 'drogue').tests).toEqual([test1]);
    const own = updateBay(rocket(), 'lower', 'drogue', { pressurePa: 90000 });
    expect(restoreBays(own, copy).restored).toBe(0);
  });

  it('does not put records on a renamed tube', () => {
    const copy = bayCopyOf(updateBay(rocket(), 'lower', 'drogue', { tests: [test1] }));
    const renamed = rocket();
    (findNode(renamed, 'lower') as ComponentNode).name = 'Booster';
    expect(restoreBays(renamed, copy).restored).toBe(0);
  });
});
