// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ComponentNode, RocketTree } from '../../../../src/engine/openRocketEngine';
import { importOrk } from '../../../../src/services/files/orkFile';
import { walkNodes } from '../../../../src/tree/treeWalk';
import { loadEngine } from '../../../testing/kernelGeometry';
import { noteTexts } from '../../../testing/importNotes';
import { KERNEL_TEST_TIMEOUT_MS } from '../../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

/* eslint-disable @typescript-eslint/no-explicit-any -- the TeaVM bundle is untyped */
let engine: any;
beforeAll(async () => {
  engine = await loadEngine();
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * A mass component type or cluster configuration the kernel has no constant
 * for is dropped with a note, and the file opens.
 *
 * The bridge throws on either (`ComponentFactory.massComponentTypeOf`, and the
 * "Unknown cluster configuration" lookup), which would refuse the whole file.
 * Desktop reads the same file with a warning and keeps the default
 * (`DocumentConfig`'s EnumSetter and ClusterConfigurationSetter). The expected
 * value is the kernel's own, read back from the same design with the tag left
 * out, never a constant of the app's.
 */

const ork = (massType: string, cluster: string): string =>
  `<?xml version="1.0"?><openrocket version="1.8"><rocket><name>T</name><subcomponents>` +
  `<stage><name>Sustainer</name><subcomponents>` +
  `<nosecone><name>Nose</name><shape>ogive</shape><length>0.1</length><aftradius>0.025</aftradius></nosecone>` +
  `<bodytube><name>Body</name><length>0.3</length><radius>0.025</radius><subcomponents>` +
  `<masscomponent><name>Payload</name><packedlength>0.05</packedlength><packedradius>0.01</packedradius>` +
  `<mass>0.05</mass>${massType}</masscomponent>` +
  `<innertube><name>Mount</name><length>0.07</length><outerradius>0.0095</outerradius>` +
  `<thickness>0.0005</thickness>${cluster}</innertube>` +
  `</subcomponents></bodytube></subcomponents></stage>` +
  `</subcomponents></rocket></openrocket>`;

const partOf = (tree: RocketTree, type: string, name: string): ComponentNode =>
  [...walkNodes(tree.components)].find((n) => n.type === type && n.name === name)!;

/** One field the kernel holds for a part after building the design. */
function kernelField(tree: RocketTree, id: string, key: string): unknown {
  engine.reset();
  const handle = engine.buildRocket(JSON.stringify(tree));
  const fields = JSON.parse(engine.getComponentFields(handle, id)) as Record<string, unknown>;
  if (typeof fields.error === 'string') throw new Error(fields.error);
  return fields[key];
}

describe('a mass component type or cluster configuration the kernel does not have', () => {
  it('is dropped, noted, and flies the kernel default', () => {
    const res = importOrk(
      ork('<masscomponenttype>bogus</masscomponenttype>', '<clusterconfiguration>7-ring</clusterconfiguration>'),
    );
    const payload = partOf(res.tree, 'masscomponent', 'Payload');
    const mount = partOf(res.tree, 'innertube', 'Mount');
    expect(payload['massComponentType']).toBeUndefined();
    expect(mount['cluster']).toBeUndefined();
    const notes = noteTexts(res.notes);
    expect(notes).toContain(
      'Payload: the file names a mass component type "bogus" this app does not have, so a plain mass component is used.',
    );
    expect(notes).toContain(
      'Mount: the file names a cluster configuration "7-ring" this app does not have, so a single motor tube is used.',
    );

    const control = importOrk(ork('', '')).tree;
    const controlPayload = partOf(control, 'masscomponent', 'Payload').id!;
    const controlMount = partOf(control, 'innertube', 'Mount').id!;
    expect(kernelField(res.tree, payload.id!, 'massComponentType')).toBe(
      kernelField(control, controlPayload, 'massComponentType'),
    );
    expect(kernelField(res.tree, mount.id!, 'cluster')).toBe(kernelField(control, controlMount, 'cluster'));
  });

  it('keeps every name the kernel has, as the kernel spells it', () => {
    const res = importOrk(
      ork(
        '<masscomponenttype>FLIGHTCOMPUTER</masscomponenttype>',
        '<clusterconfiguration>3-ring</clusterconfiguration>',
      ),
    );
    const payload = partOf(res.tree, 'masscomponent', 'Payload');
    const mount = partOf(res.tree, 'innertube', 'Mount');
    expect(noteTexts(res.notes).filter((n) => n.includes('does not have'))).toEqual([]);
    expect(kernelField(res.tree, payload.id!, 'massComponentType')).toBe('flightcomputer');
    expect(kernelField(res.tree, mount.id!, 'cluster')).toBe('3-ring');
  });
});
