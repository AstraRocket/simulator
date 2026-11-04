import { describe, it, expect, beforeAll } from 'vitest';
import {
  DEFAULT_CUSTOM_GROUP,
  builtinsForType,
  groupsOf,
  mergeCustom,
} from '../../../src/services/materials/materials';
import type { Material } from '../../../src/services/materials/materialTypes';
import { serveData } from '../../testing/serveData';

const m = (name: string, group: string, density: number, custom = false): Material => ({
  name,
  type: 'bulk',
  density,
  group,
  ...(custom ? { custom: true } : {}),
});

const BUILTINS = [
  m('Acrylic', 'Plastics', 1190),
  m('Delrin', 'Plastics', 1420),
  m('Balsa', 'Woods', 170),
  m('Plywood (birch)', 'Woods', 630),
  m('Blue tube', 'Composites', 1300),
];

describe('mergeCustom', () => {
  it('leaves the built-ins alone when there are no custom materials', () => {
    expect(mergeCustom(BUILTINS, [])).toEqual(BUILTINS);
  });

  it('replaces a built-in of the same name, in place, keeping its group', () => {
    const merged = mergeCustom(BUILTINS, [m('Blue tube', DEFAULT_CUSTOM_GROUP, 1250, true)]);
    expect(merged.filter((x) => x.name === 'Blue tube')).toHaveLength(1);
    const blue = merged.find((x) => x.name === 'Blue tube')!;
    expect(blue.density).toBe(1250);
    expect(blue.custom).toBe(true);
    expect(blue.group).toBe('Composites');
    expect(merged.map((x) => x.name)).toEqual(BUILTINS.map((x) => x.name));
  });

  it('puts a new material in the group it was given, after the last member', () => {
    const merged = mergeCustom(BUILTINS, [m('Aircraft ply 1/8', 'Woods', 700, true)]);
    const names = merged.map((x) => x.name);
    expect(names).toEqual(['Acrylic', 'Delrin', 'Balsa', 'Plywood (birch)', 'Aircraft ply 1/8', 'Blue tube']);
    expect(merged.find((x) => x.name === 'Aircraft ply 1/8')!.group).toBe('Woods');
  });

  it('appends a material whose group the built-ins do not have', () => {
    const merged = mergeCustom(BUILTINS, [m('Mystery goo', DEFAULT_CUSTOM_GROUP, 900, true)]);
    expect(merged[merged.length - 1]!.name).toBe('Mystery goo');
    expect(merged[merged.length - 1]!.group).toBe(DEFAULT_CUSTOM_GROUP);
  });

  it('re-homes a material stored under the Custom group', () => {
    const merged = mergeCustom(BUILTINS, [m('Old one', 'Custom', 800, true)]);
    expect(merged.find((x) => x.name === 'Old one')!.group).toBe(DEFAULT_CUSTOM_GROUP);
    expect(merged.some((x) => x.group === 'Custom')).toBe(false);
  });

  it('keeps the custom flag, which is what the picker stars', () => {
    const merged = mergeCustom(BUILTINS, [m('Blue tube', 'Composites', 1250, true), m('New', 'Woods', 700, true)]);
    for (const name of ['Blue tube', 'New']) expect(merged.find((x) => x.name === name)!.custom).toBe(true);
    expect(merged.find((x) => x.name === 'Balsa')!.custom).toBeUndefined();
  });

  it('never lists one name twice', () => {
    const merged = mergeCustom(BUILTINS, [
      m('Blue tube', 'Composites', 1250, true),
      m('Balsa', 'Custom', 180, true),
      m('Brand new', 'Plastics', 1000, true),
    ]);
    const names = merged.map((x) => x.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
describe('groupsOf', () => {
  beforeAll(serveData);

  it('offers the groups that type actually uses, plus somewhere for the rest', async () => {
    const bulk = groupsOf(await builtinsForType('bulk'));
    expect(bulk).toContain('Woods');
    expect(bulk).toContain('Adhesives');
    expect(bulk[bulk.length - 1]).toBe(DEFAULT_CUSTOM_GROUP);
    expect(bulk).not.toContain('Kevlars');
    expect(groupsOf(await builtinsForType('line'))).toContain('Kevlars');
  });

  it('does not offer the retired Custom group', async () => {
    for (const type of ['bulk', 'surface', 'line'] as const) {
      expect(groupsOf(await builtinsForType(type))).not.toContain('Custom');
    }
  });

  it('offers a group the user invented, when one is in the list', () => {
    const mine: Material = { name: 'My mix', type: 'bulk', density: 1050, group: 'Putties', custom: true };
    expect(groupsOf([mine])).toEqual(['Putties', DEFAULT_CUSTOM_GROUP]);
  });
});
