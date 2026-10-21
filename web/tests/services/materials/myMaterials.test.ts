// cspell:ignore matedtpan -- desktop's MaterialEditPanel message keys
import { beforeEach, describe, expect, it } from 'vitest';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import { setMaterialStore } from '../../../src/services/materials/materialStore';
import { listCustom } from '../../../src/services/materials/materials';
import type { Material } from '../../../src/services/materials/materialTypes';
import { partsUsing, withMaterialReplaced } from '../../../src/services/materials/materialEdits';
import {
  deleteAllMaterials,
  deleteMaterial,
  saveMaterial,
  type DesignAccess,
  type ScopedMaterial,
} from '../../../src/services/materials/myMaterials';

/**
 * Custom Materials follows desktop's material manager, OpenRocket 24.12's
 * `MaterialEditPanel` (disassembled from the release jar):
 *
 * - the Edit action removes the old material without a warning, then: a result
 *   in the document is `loadFrom` into the original `Material` object every
 *   using component shares, so those parts change; a result in the application
 *   database leaves them alone, and if components used the old one it is
 *   marked a document material and added to each using document;
 * - `removeMaterial(m, true)` refuses a document material components use
 *   (matedtpan.dlg.RemoveUsedMaterial.Document), and for an application
 *   material components use, removes it from the database and adds it to the
 *   document (RemoveUsedMaterial.Application);
 * - Revert all removes every user-defined material from the application
 *   database and from the document's three databases.
 */

let library: Material[] = [];
let tree: RocketTree;

const design: DesignAccess = {
  tree: () => tree,
  apply: (change) => {
    tree = change(tree);
  },
};

const ply = (density = 650): ScopedMaterial => ({
  name: 'Birch ply',
  type: 'bulk',
  density,
  group: 'Woods',
  scope: 'design',
});

/** A design-list entry as the tree stores it: no scope. */
const asDoc = ({ scope: _scope, ...m }: ScopedMaterial) => m;

/** A body tube and a fin set (body and fillet) of `bulk`, and a parachute and shock cord of cloth and cord. */
const designWith = (bulk: { name: string; density: number }): RocketTree => ({
  name: 'Test',
  components: [
    {
      type: 'stage',
      id: 's',
      children: [
        { type: 'bodytube', id: 'tube', name: 'Body', materialName: bulk.name, density: bulk.density },
        {
          type: 'trapezoidfinset',
          id: 'fins',
          name: 'Fins',
          materialName: 'Balsa',
          density: 170,
          filletMaterialName: bulk.name,
          filletDensity: bulk.density,
        },
        {
          type: 'parachute',
          id: 'chute',
          name: 'Chute',
          surfaceMaterialName: 'Silk',
          surfaceDensity: 0.04,
          lineMaterialName: 'Kev',
          lineDensity: 0.002,
        },
        { type: 'shockcord', id: 'cord', name: 'Cord', lineMaterialName: 'Kev', lineDensity: 0.002 },
      ] as ComponentNode[],
    },
  ],
});

const node = (id: string): ComponentNode => (tree.components[0]!.children as ComponentNode[]).find((n) => n.id === id)!;

beforeEach(() => {
  library = [];
  setMaterialStore({
    list: async () => library,
    add: async (m) => {
      library = [{ ...m, custom: true }, ...library.filter((x) => !(x.name === m.name && x.type === m.type))];
    },
    remove: async (name, type) => {
      library = library.filter((x) => !(x.name === name && x.type === type));
    },
  });
  tree = designWith({ name: 'Plywood', density: 630 });
});

describe('which parts use a material', () => {
  it('finds every slot of the type, by name and density', () => {
    const t = designWith({ name: 'Birch ply', density: 650 });
    expect(partsUsing(t, ply()).map((n) => n.id)).toEqual(['tube', 'fins']);
    expect(partsUsing(t, ply(651))).toEqual([]);
    expect(partsUsing(t, { name: 'Kev', type: 'line', density: 0.002 }).map((n) => n.id)).toEqual(['chute', 'cord']);
    // A cloth of that name is not a cord of that name.
    expect(partsUsing(t, { name: 'Kev', type: 'surface', density: 0.002 })).toEqual([]);
  });

  it('moves every slot holding it, and shares every part that held none', () => {
    const t = designWith({ name: 'Birch ply', density: 650 });
    const next = withMaterialReplaced(t, ply(), { ...ply(700), name: 'Ply B' });
    const kids = next.components[0]!.children as ComponentNode[];
    expect(kids[0]).toMatchObject({ materialName: 'Ply B', density: 700, materialGroup: 'Woods' });
    expect(kids[1]).toMatchObject({ materialName: 'Balsa', filletMaterialName: 'Ply B', filletDensity: 700 });
    expect(kids[2]).toBe((t.components[0]!.children as ComponentNode[])[2]);
  });
});

describe('saving', () => {
  it('keeps a new material in the design when the browser box is clear', async () => {
    await saveMaterial(design, null, ply());
    expect(tree.documentMaterials).toEqual([{ name: 'Birch ply', type: 'bulk', density: 650, group: 'Woods' }]);
    expect(library).toEqual([]);
  });

  it('puts a new material in the browser list when it is ticked', async () => {
    await saveMaterial(design, null, { ...ply(), scope: 'library' });
    expect((await listCustom()).map((m) => m.name)).toEqual(['Birch ply']);
    expect(tree.documentMaterials).toBeUndefined();
  });

  it('refuses a browser material under another one’s name, and a blank name', async () => {
    await saveMaterial(design, null, { ...ply(), scope: 'library' });
    await expect(saveMaterial(design, null, { ...ply(700), scope: 'library' })).rejects.toMatchObject({
      key: 'errors.material.nameTaken',
    });
    await expect(saveMaterial(design, null, { ...ply(), name: '  ' })).rejects.toMatchObject({
      key: 'errors.material.nameRequired',
    });
    expect(library.map((m) => m.density)).toEqual([650]);
  });

  it('moves the parts with an edit of a design material', async () => {
    tree = { ...designWith({ name: 'Birch ply', density: 650 }), documentMaterials: [asDoc(ply())] };
    await saveMaterial(design, ply(), { ...ply(700), name: 'Ply B' });
    expect(node('tube')).toMatchObject({ materialName: 'Ply B', density: 700 });
    expect(node('fins')).toMatchObject({ filletMaterialName: 'Ply B', filletDensity: 700 });
    expect(tree.documentMaterials).toEqual([{ name: 'Ply B', type: 'bulk', density: 700, group: 'Woods' }]);
  });

  it('leaves the parts with an edit of a browser material, and keeps the old one in the design for them', async () => {
    tree = designWith({ name: 'Birch ply', density: 650 });
    library = [{ name: 'Birch ply', type: 'bulk', density: 650, group: 'Woods', custom: true }];
    const old = { ...ply(), scope: 'library' as const };
    await saveMaterial(design, old, { ...old, density: 700 });
    expect(node('tube')).toMatchObject({ materialName: 'Birch ply', density: 650 });
    expect(library.map((m) => m.density)).toEqual([700]);
    expect(tree.documentMaterials).toEqual([{ name: 'Birch ply', type: 'bulk', density: 650, group: 'Woods' }]);
  });

  it('moves the parts when a browser material is moved into the design', async () => {
    tree = designWith({ name: 'Birch ply', density: 650 });
    library = [{ name: 'Birch ply', type: 'bulk', density: 650, group: 'Woods', custom: true }];
    await saveMaterial(design, { ...ply(), scope: 'library' }, ply(700));
    expect(node('tube')).toMatchObject({ density: 700 });
    expect(library).toEqual([]);
    expect(tree.documentMaterials).toEqual([{ name: 'Birch ply', type: 'bulk', density: 700, group: 'Woods' }]);
  });

  it('takes a design material into the browser list, staying in the design only while parts use it', async () => {
    tree = { ...tree, documentMaterials: [asDoc(ply())] };
    await saveMaterial(design, ply(), { ...ply(), scope: 'library' });
    expect(tree.documentMaterials).toBeUndefined();
    expect(library.map((m) => m.name)).toEqual(['Birch ply']);

    library = [];
    tree = { ...designWith({ name: 'Birch ply', density: 650 }), documentMaterials: [asDoc(ply())] };
    await saveMaterial(design, ply(), { ...ply(), scope: 'library' });
    expect(tree.documentMaterials).toEqual([asDoc(ply())]);
    expect(node('tube')).toMatchObject({ density: 650 });
  });
});

describe('deleting', () => {
  it('refuses a design material parts are made of, naming them', async () => {
    tree = { ...designWith({ name: 'Birch ply', density: 650 }), documentMaterials: [asDoc(ply())] };
    const refused = await deleteMaterial(design, ply());
    expect(refused?.map((n) => n.id)).toEqual(['tube', 'fins']);
    expect(tree.documentMaterials).toHaveLength(1);
  });

  it('deletes a design material no part uses', async () => {
    tree = { ...tree, documentMaterials: [asDoc(ply())] };
    expect(await deleteMaterial(design, ply())).toBeNull();
    expect(tree.documentMaterials).toBeUndefined();
  });

  it('deletes a browser material parts use, and keeps it in the design', async () => {
    tree = designWith({ name: 'Birch ply', density: 650 });
    library = [{ name: 'Birch ply', type: 'bulk', density: 650, group: 'Woods', custom: true }];
    expect(await deleteMaterial(design, { ...ply(), scope: 'library' })).toBeNull();
    expect(library).toEqual([]);
    expect(tree.documentMaterials).toEqual([{ name: 'Birch ply', type: 'bulk', density: 650, group: 'Woods' }]);
  });

  it('deletes everything the user defined, in both lists, and leaves the parts', async () => {
    tree = { ...designWith({ name: 'Birch ply', density: 650 }), documentMaterials: [asDoc(ply())] };
    library = [
      { name: 'A', type: 'bulk', density: 1, group: 'Other', custom: true },
      { name: 'B', type: 'line', density: 1, group: 'Other', custom: true },
    ];
    await deleteAllMaterials(design);
    expect(library).toEqual([]);
    expect(tree.documentMaterials).toBeUndefined();
    expect(node('tube')).toMatchObject({ materialName: 'Birch ply', density: 650 });
  });
});
