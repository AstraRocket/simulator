// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import type { ComponentNode, RocketTree } from '../../../../src/engine/openRocketEngine';
import { importOrk } from '../../../../src/services/files/orkFile';
import { orkArchive } from '../../../../src/services/files/saveOrk';

const tree = {
  components: [
    {
      type: 'stage',
      id: 's',
      children: [{ type: 'nosecone', id: 'n', shape: 'ogive', length: 0.2, aftRadius: 0.03 } as ComponentNode],
    } as ComponentNode,
  ],
} as RocketTree;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

describe('the file browser images in a saved .ork', () => {
  it('are stored after the design, as desktop writes them, and read past on opening', () => {
    const bytes = orkArchive({ name: 'M', tree }, { preview: PNG, thumbnail: PNG.slice().reverse() });
    const members = unzipSync(bytes);
    expect(Object.keys(members)).toEqual(['rocket.ork', 'preview.png', 'thumbnail.png']);
    expect(members['preview.png']).toEqual(PNG);
    expect(importOrk(bytes.slice().buffer as ArrayBuffer).tree.components).toHaveLength(1);
  });

  it('are left out when they could not be drawn', () => {
    expect(Object.keys(unzipSync(orkArchive({ name: 'M', tree }, { thumbnail: new Uint8Array() })))).toEqual([
      'rocket.ork',
    ]);
  });
});
