// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { RocketTree } from '../../../src/engine/openRocketEngine';
import { exportOrk, importOrk } from '../../../src/services/files/orkFile';
import { exportRkt } from '../../../src/services/files/rktExport';
import { parseDesignFile } from '../../../src/services/files/designFile';
import { KNOWN_COMPONENT_TAGS } from '../../../src/services/files/ork/passthrough';

const tree = (extra: Partial<RocketTree> = {}): RocketTree =>
  ({
    components: [
      {
        type: 'stage',
        id: 's',
        name: 'S',
        children: [
          { type: 'nosecone', id: 'n', length: 0.1, aftRadius: 0.02 },
          { type: 'bodytube', id: 'b', length: 0.3, outerRadius: 0.02 },
          { type: 'bodytube', id: 'i', length: 0.1, outerRadius: 0.02, ignored: true },
        ],
      },
    ],
    ...extra,
  }) as RocketTree;

describe('part flags in a .ork', () => {
  it('round-trips an ignored part once, as a tag desktop skips', () => {
    const xml = exportOrk({ name: 'R', tree: tree() });
    expect(xml.match(/<isignored>true<\/isignored>/g)).toHaveLength(1);
    const back = importOrk(xml).tree;
    expect(back.components[0]!.children![2]).toMatchObject({ type: 'bodytube', ignored: true });
    expect(exportOrk({ name: 'R', tree: back }).match(/<isignored>/g)).toHaveLength(1);
  });

  it('writes the base drag hack as a plain cone, no tag, and loads it back as the flag alone', () => {
    const xml = exportOrk({ name: 'R', tree: tree({ baseDragHack: true }) });
    expect(xml).not.toContain('draghack');
    expect(xml).toContain('<overridecd>0</overridecd>');
    const back = parseDesignFile(xml).tree;
    expect(back.baseDragHack).toBe(true);
    expect(back.components[0]!.children!.map((n) => n.type)).toEqual(['nosecone', 'bodytube', 'bodytube']);
    expect(exportOrk({ name: 'R', tree: back }).match(/<nosecone>/g)).toHaveLength(2);
  });

  it('writes the base drag hack to RockSim as a massless transition from a point, and loads it back as the flag', () => {
    const { xml } = exportRkt('R', tree({ baseDragHack: true }));
    expect(xml.match(/<Transition>/g)).toHaveLength(1);
    const back = parseDesignFile(xml).tree;
    expect(back.baseDragHack).toBe(true);
    expect(back.components[0]!.children!.map((n) => n.type)).toEqual(['nosecone', 'bodytube', 'bodytube']);
  });

  it('writes no cone without the flag', () => {
    expect(exportOrk({ name: 'R', tree: tree() }).match(/<nosecone>/g)).toHaveLength(1);
    expect(exportRkt('R', tree()).xml).not.toContain('<Transition>');
  });

  it('knows the ignore tag, so passthrough does not write it twice', () => {
    expect(KNOWN_COMPONENT_TAGS.has('isignored')).toBe(true);
  });
});
