import { describe, it, expect } from 'vitest';
import { migrateWorkspace } from '../../../src/services/storage/workspaceMigrate';
import { flightKey } from '../../../src/services/flight/simulations';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import type { Workspace } from '../../../src/services/storage/workspaceStore';

const node = (o: object) => o as unknown as ComponentNode;

const tree = { components: [node({ type: 'bodytube', id: 'aft', motorMount: true })] } as unknown as RocketTree;

const sim = (over: object = {}) => ({ id: 'a', name: 'A', configId: 'c1', launch: {}, result: null, ...over });

const v3 = (over: object = {}) => ({
  version: 3,
  tree,
  sims: [sim()],
  configs: [{ id: 'c1', name: null, motors: {} }],
  activeId: 'a',
  loadedMeta: null,
  ...over,
});

describe('migrateWorkspace', () => {
  it('refuses a blob that is not a workspace', () => {
    expect(migrateWorkspace(null)).toBeNull();
    expect(migrateWorkspace(v3({ tree: { components: 'nope' } }))).toBeNull();
    expect(migrateWorkspace(v3({ sims: [] }))).toBeNull();
  });

  // Every reader after this one dereferences each entry, so a null entry has to
  // be refused here rather than throw later in the load.
  it('refuses a blob whose simulations, configurations or components are not objects', () => {
    expect(migrateWorkspace(v3({ sims: [sim(), null] }))).toBeNull();
    expect(migrateWorkspace(v3({ sims: [sim({ id: 7 })] }))).toBeNull();
    expect(migrateWorkspace(v3({ tree: { components: [null] } }))).toBeNull();
    expect(migrateWorkspace(v3({ tree: { components: [node({ type: 'bodytube', children: [null] })] } }))).toBeNull();
    expect(migrateWorkspace(v3({ tree: null }))).toBeNull();
    expect(migrateWorkspace(v3({ configs: [null] }))).toBeNull();
    expect(migrateWorkspace(v3({ configs: [{ name: 'no id' }] }))).toBeNull();
    expect(migrateWorkspace(v3({ configs: [{ id: 'c1', motors: {} }] }))).not.toBeNull();
  });

  it('refuses a version this build does not know, rather than half-reading it', () => {
    // An installed PWA can have an older build cached, so a newer workspace is a
    // live possibility. Reading it as far as it parses would overwrite the user's
    // design with a partial copy of itself.
    expect(migrateWorkspace(v3({ version: 4 }))).toBeNull();
    expect(migrateWorkspace(v3({ version: 2 }))).toBeNull();
  });

  it('keeps a version-3 workspace as it is', () => {
    const w = v3() as unknown as Workspace;
    expect(migrateWorkspace(w)).toBe(w);
  });

  it('refuses a workspace with no configurations, which cannot fly', () => {
    expect(migrateWorkspace(v3({ configs: [] }))).toBeNull();
    expect(migrateWorkspace(v3({ configs: undefined }))).toBeNull();
  });
});

/**
 * A stored design can hold a rail button or centering ring whose linked
 * dimensions disagree. Loading holds them as the kernel builds them, so the panel shows
 * what flies, and a result flown from the stored design stays current.
 */
describe('migrateWorkspace linked dimensions', () => {
  const stored = (parts: object[]) =>
    ({
      version: 3,
      tree: {
        components: [
          node({
            type: 'stage',
            id: 's',
            children: [node({ type: 'bodytube', id: 'b', outerRadius: 0.03, children: parts.map(node) })],
          }),
        ],
      },
      sims: [{ id: 'a', name: 'A', configId: 'c1', launch: {}, result: null }],
      configs: [{ id: 'c1', name: null, motors: {} }],
      activeId: 'a',
      loadedMeta: null,
    }) as unknown as Workspace;
  const part = (w: Workspace | null, id: string) =>
    (w!.tree.components[0]!.children![0]!.children as ComponentNode[]).find((n) => n.id === id)!;

  it('settles a rail button and a fixed ring the way the bridge builds them', () => {
    const w = migrateWorkspace(
      stored([
        {
          type: 'railbutton',
          id: 'rb',
          outerDiameter: 0.006,
          innerDiameter: 0.008,
          height: 0.01,
          baseHeight: 0.009,
          flangeHeight: 0.002,
        },
        { type: 'centeringring', id: 'cr', outerRadius: 0.01, innerRadius: 0.015 },
      ]),
    );
    expect(part(w, 'rb')).toMatchObject({ innerDiameter: 0.006, height: 0.01, baseHeight: 0.009 });
    expect(part(w, 'rb')['flangeHeight']).toBeCloseTo(0.001, 15);
    expect(part(w, 'cr')).toMatchObject({ outerRadius: 0.015, innerRadius: 0.015 });
  });

  it('leaves an automatic ring outer radius to follow the bore, as the kernel does', () => {
    const w = stored([
      { type: 'centeringring', id: 'cr', outerRadiusAuto: true, outerRadius: 0.01, innerRadius: 0.015 },
    ]);
    expect(migrateWorkspace(w)).toBe(w);
  });

  it('returns a consistent workspace as the same object', () => {
    const w = stored([
      { type: 'railbutton', id: 'rb', outerDiameter: 0.01, height: 0.003, baseHeight: 0, flangeHeight: 0 },
      { type: 'centeringring', id: 'cr', outerRadius: 0.02, innerRadius: 0.01 },
    ]);
    expect(migrateWorkspace(w)).toBe(w);
  });

  it('keys the settled design as the stored one, so its results do not age', () => {
    const w = stored([{ type: 'railbutton', id: 'rb', height: 0.01, baseHeight: 0.009, flangeHeight: 0.002 }]);
    const settled = migrateWorkspace(w)!;
    expect(settled.tree).not.toBe(w.tree);
    expect(flightKey(settled.tree)).toBe(flightKey(w.tree));
  });
});
