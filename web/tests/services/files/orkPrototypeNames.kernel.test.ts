// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import { exportOrk, importOrk } from '../../../src/services/files/orkFile';
import { exportRkt } from '../../../src/services/files/rktExport';
import { importRkt } from '../../../src/services/files/rktImport';
import { exportCdx1 } from '../../../src/services/files/rasaeroExport';
import { walkNodes } from '../../../src/tree/treeWalk';
import { noteTexts } from '../../testing/importNotes';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

/* eslint-disable @typescript-eslint/no-explicit-any -- the TeaVM bundle is untyped */
let engine: any;
beforeAll(async () => {
  (globalThis as any).$rt_putStdoutCustom ??= () => {};
  (globalThis as any).$rt_putStderrCustom ??= () => {};
  engine = await import('../../../src/engine/vendor/openrocket-engine.mjs' as string);
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// On a plain object these names resolve to Object.prototype functions.

const PROTOTYPE_NAMES = ['constructor', 'toString', 'hasOwnProperty', '__proto__'];

const fixture = (name: string): string => {
  const slot = (xml: string) => (name ? xml : '');
  return (
    `<?xml version="1.0"?><openrocket version="1.8"><rocket><name>Proto</name><subcomponents><stage><name>S</name><subcomponents>` +
    `<nosecone><name>Nose</name><length>0.1</length><aftradius>0.0127</aftradius><thickness>0.001</thickness>` +
    slot(`<shape>${name}</shape>`) +
    `<shapeparameter>1</shapeparameter>` +
    slot(`<finish>${name}</finish>`) +
    slot(`<color red="${name}" green="${name}" blue="${name}"/>`) +
    `</nosecone>` +
    `<bodytube><name>Body</name><length>0.254</length><radius>0.0127</radius><thickness>0.0005</thickness>` +
    `<material type="bulk" density="680"${name ? ` group="${name}"` : ''}>Cardboard</material>` +
    `<subcomponents>` +
    `<trapezoidfinset><name>Fins</name><fincount>3</fincount><rootchord>0.0508</rootchord><tipchord>0.0254</tipchord>` +
    `<sweeplength>0.0254</sweeplength><height>0.0254</height><thickness>0.003</thickness>` +
    slot(`<crosssection>${name}</crosssection>`) +
    `<filletradius>0.003</filletradius>` +
    `<filletmaterial type="bulk" density="1200"${name ? ` group="${name}"` : ''}>Epoxy</filletmaterial>` +
    `<axialoffset method="bottom">0</axialoffset></trapezoidfinset>` +
    `<railbutton><name>Button</name><outerdiameter>0.0125</outerdiameter><height>0.012</height>` +
    `<material type="bulk" density="1400"${name ? ` group="${name}"` : ''}>Delrin</material>` +
    `<axialoffset method="middle">0</axialoffset></railbutton>` +
    `</subcomponents></bodytube>` +
    `</subcomponents></stage></subcomponents></rocket></openrocket>`
  );
};

const byType = (tree: RocketTree, type: string): ComponentNode =>
  [...walkNodes(tree.components)].find((n) => n.type === type)!;

function kernelEnums(tree: RocketTree): { finish: string; shape: string; crossSection: string } {
  engine.reset();
  const handle = engine.buildRocket(JSON.stringify(tree));
  const fields = (node: ComponentNode) => {
    const f = JSON.parse(engine.getComponentFields(handle, node.id) as string) as Record<string, unknown>;
    if (typeof f['error'] === 'string') throw new Error(f['error']);
    return f;
  };
  const nose = fields(byType(tree, 'nosecone'));
  const fins = fields(byType(tree, 'trapezoidfinset'));
  return { finish: String(nose['finish']), shape: String(nose['shape']), crossSection: String(fins['crossSection']) };
}

const FUNCTION_TEXT = /\[native code\]|function\s*\(|function [A-Za-z]/;

describe('a .ork with Object.prototype names in every file-keyed slot', () => {
  it.each(PROTOTYPE_NAMES)('"%s" imports with a note per dropped value and the kernel defaults', (name) => {
    const res = importOrk(fixture(name));
    const nose = byType(res.tree, 'nosecone');
    const fins = byType(res.tree, 'trapezoidfinset');
    expect(nose['finish']).toBeUndefined();
    expect(nose['shape']).toBe('ogive');
    expect(nose['color']).toBeUndefined();
    expect(fins['crossSection']).toBeUndefined();
    const notes = noteTexts(res.notes);
    expect(notes).toContain(
      `Nose: the file names a surface finish "${name}" this app does not have, so regular paint is used.`,
    );
    expect(notes).toContain(
      `Nose: the file names a shape "${name}" this app does not have, so the default shape is used.`,
    );
    expect(notes).toContain(
      `Fins: the file names a fin cross section "${name}" this app does not have, so a square cross section is used.`,
    );
    expect(kernelEnums(res.tree)).toEqual(kernelEnums(importOrk(fixture('')).tree));
  });

  it.each(PROTOTYPE_NAMES)('"%s" round-trips through every writer without a function in the output', (name) => {
    const { tree } = importOrk(fixture(name));
    const ork = exportOrk({ name: 'Proto', tree });
    expect(ork).not.toMatch(FUNCTION_TEXT);
    expect(ork).not.toContain(`group="${name}"`);
    expect(ork).toContain('<finish>normal</finish>');
    const { xml: rkt } = exportRkt('Proto', tree);
    expect(rkt).not.toMatch(FUNCTION_TEXT);
    expect(rkt).toContain('<FinishCode>2</FinishCode>');
    expect(rkt).toContain('<TipShapeCode>0</TipShapeCode>');
    const cdx1 = exportCdx1({ name: 'Proto', tree, launchMassKg: 0.3, launchCgM: 0.15 });
    expect(cdx1).not.toMatch(FUNCTION_TEXT);
    expect(cdx1).toContain('<Surface>Rough Camouflage Paint</Surface>');
    expect(cdx1).toContain('<AirfoilSection>Square</AirfoilSection>');
  });

  it.each(PROTOTYPE_NAMES)('"%s" as a RockSim color name is no color', (name) => {
    const { tree } = importRkt(
      `<RockSimDocument><DesignInformation><RocketDesign><Name>Proto</Name><StageCount>1</StageCount><Stage3Parts>` +
        `<BodyTube><Name>Body</Name><Len>254</Len><OD>25.4</OD><ID>24.4</ID><Color>${name}</Color></BodyTube>` +
        `</Stage3Parts></RocketDesign></DesignInformation></RockSimDocument>`,
    );
    const body = byType(tree, 'bodytube');
    expect(body['color']).toBeUndefined();
    expect(exportOrk({ name: 'Proto', tree })).not.toMatch(FUNCTION_TEXT);
  });

  it('reads the material groups through to the .ork writer when desktop has them', () => {
    const { tree } = importOrk(fixture('').replace('density="680"', 'density="680" group="Composites"'));
    expect(byType(tree, 'bodytube')['materialGroup']).toBe('Composites');
    expect(exportOrk({ name: 'Proto', tree })).toContain('density="680" group="Composites">Cardboard</material>');
  });
});
