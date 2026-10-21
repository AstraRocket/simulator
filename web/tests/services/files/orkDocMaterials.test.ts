// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportOrk, importOrk } from '../../../src/services/files/orkFile';
import { noteTexts } from '../../testing/importNotes';

/**
 * The design's own materials: desktop's document material database, which a
 * `.ork` carries as `<docprefs><docmaterials>`. Desktop's material box lists them
 * on every part (`MaterialModel` adds `DocumentPreferences.getDatabase(type)`
 * to the application database), so they are read into the tree, not carried as
 * raw XML.
 *
 * The `<docprefs>` blocks below are what OpenRocket 24.12 wrote: its
 * `GeneralRocketSaver` saving the bundled a-simple-model-rocket.ork with four
 * document materials added (two of one name at two densities, a surface and a
 * line). `getAllMaterials` merges the three databases into one, so the list is
 * sorted by name and then density across all types.
 */
const DESKTOP_DOCPREFS = `  <docprefs>
    <docmaterials>
      <material>BULK|Birch ply|650.0|Woods</material>
      <material>BULK|Birch ply|700.0|Woods</material>
      <material>BULK|Cardboard|680.0|Custom</material>
      <material>LINE|Elastic cord (round 2mm, 1/16 in)|0.0018|Custom</material>
      <material>LINE|Kev cord|0.002|ThreadsLines</material>
      <material>BULK|Polystyrene|1050.0|Custom</material>
      <material>SURFACE|Ripstop nylon|0.067|Custom</material>
      <material>SURFACE|Silk|0.04|Fabrics</material>
    </docmaterials>
  </docprefs>`;

const docWith = (docExtra: string): string => `<?xml version='1.0' encoding='utf-8'?>
<openrocket version="1.9" creator="OpenRocket 24.12">
  <rocket>
    <name>Materials test</name>
    <subcomponents>
      <stage>
        <name>Sustainer</name>
        <subcomponents>
          <bodytube>
            <name>Body tube</name>
            <length>0.3</length>
            <thickness>0.001</thickness>
            <outerradius>0.026</outerradius>
          </bodytube>
        </subcomponents>
      </stage>
    </subcomponents>
  </rocket>
${docExtra}
</openrocket>`;

const roundTrip = (xml: string): string => {
  const res = importOrk(xml);
  return exportOrk({ name: res.name, tree: res.tree });
};

/** The `<material>` texts of a written file's `<docmaterials>`, in order. */
const written = (xml: string): string[] =>
  [...(xml.match(/<docmaterials>([\s\S]*?)<\/docmaterials>/)?.[1] ?? '').matchAll(/<material>(.*?)<\/material>/g)].map(
    (m) => m[1]!,
  );

describe('reading a desktop document material list', () => {
  it('reads every entry 24.12 wrote, two of one name at two densities included', () => {
    const { tree } = importOrk(docWith(DESKTOP_DOCPREFS));
    expect(tree.documentMaterials).toEqual([
      { name: 'Birch ply', type: 'bulk', density: 650, group: 'Woods' },
      { name: 'Birch ply', type: 'bulk', density: 700, group: 'Woods' },
      { name: 'Cardboard', type: 'bulk', density: 680, group: 'Custom' },
      { name: 'Elastic cord (round 2mm, 1/16 in)', type: 'line', density: 0.0018, group: 'Custom' },
      { name: 'Kev cord', type: 'line', density: 0.002, group: 'ThreadsLines' },
      { name: 'Polystyrene', type: 'bulk', density: 1050, group: 'Custom' },
      { name: 'Ripstop nylon', type: 'surface', density: 0.067, group: 'Custom' },
      { name: 'Silk', type: 'surface', density: 0.04, group: 'Fabrics' },
    ]);
  });

  it('reads the newer five-piece form, the shear modulus between density and group', () => {
    // Upstream's `toStorableString` since the shear modulus was added.
    const { tree } = importOrk(
      docWith(
        '<docprefs><docmaterials><material>BULK|G10|1800.0|3.0E9|Composites</material></docmaterials></docprefs>',
      ),
    );
    expect(tree.documentMaterials).toEqual([{ name: 'G10', type: 'bulk', density: 1800, group: 'Composites' }]);
  });

  it('leaves out an entry desktop could not build a material from, and says so', () => {
    const res = importOrk(
      docWith(
        `<docprefs><docmaterials>
          <material>BULK|Good|500.0|Woods</material>
          <material>ROCK|Bad type|500.0|Woods</material>
          <material>BULK|No density|abc|Woods</material>
          <material>BULK|Zero|0.0|Woods</material>
          <material>BULK|Two pieces</material>
        </docmaterials></docprefs>`,
      ),
    );
    expect(res.tree.documentMaterials?.map((m) => m.name)).toEqual(['Good']);
    expect(noteTexts(res.notes).join('\n')).toContain('Design materials skipped as unreadable: 4.');
  });

  it('does not call the document preferences uneditable when they held only materials', () => {
    const notes = noteTexts(importOrk(docWith(DESKTOP_DOCPREFS)).notes).join('\n');
    expect(notes).not.toMatch(/no editor for/i);
  });

  it('still names the document preferences when something else is left in them', () => {
    const prefs = DESKTOP_DOCPREFS.replace(
      '  <docprefs>',
      '  <docprefs>\n    <pref key="RocketPanel.showWarnings" type="boolean">true</pref>',
    );
    const notes = noteTexts(importOrk(docWith(prefs)).notes).join('\n');
    expect(notes).toMatch(/no editor for: docprefs/i);
  });
});

describe('writing the design materials back', () => {
  it('writes the list as 24.12 does: its storable form, by name then density across types', () => {
    const out = roundTrip(docWith(DESKTOP_DOCPREFS));
    expect(written(out)).toEqual([
      'BULK|Birch ply|650|Woods',
      'BULK|Birch ply|700|Woods',
      'BULK|Cardboard|680|Custom',
      'LINE|Elastic cord (round 2mm, 1/16 in)|0.0018|Custom',
      'LINE|Kev cord|0.002|ThreadsLines',
      'BULK|Polystyrene|1050|Custom',
      'SURFACE|Ripstop nylon|0.067|Custom',
      'SURFACE|Silk|0.04|Fabrics',
    ]);
    expect(out.match(/<docmaterials>/g)).toHaveLength(1);
    expect(out.match(/<docprefs/g)).toHaveLength(1);
  });

  it('keeps the rest of the document preferences beside the list', () => {
    const prefs = DESKTOP_DOCPREFS.replace(
      '  <docprefs>',
      '  <docprefs>\n    <pref key="RocketPanel.showWarnings" type="boolean">true</pref>',
    );
    const out = roundTrip(docWith(prefs));
    expect(out).toContain('<pref key="RocketPanel.showWarnings" type="boolean">true</pref>');
    expect(written(out)).toHaveLength(8);
  });

  it('adds a <docprefs> at the end of the document for a design that had none', () => {
    const { name, tree } = importOrk(docWith(''));
    const out = exportOrk({
      name,
      tree: { ...tree, documentMaterials: [{ name: 'Mine|best', type: 'bulk', density: 420, group: 'Paper' }] },
    });
    // A bar would split the name, so desktop's saver writes a space for it;
    // the catalog's Paper is desktop's PaperProducts.
    expect(out).toMatch(
      /<docprefs><docmaterials><material>BULK\|Mine best\|420\|PaperProducts<\/material><\/docmaterials><\/docprefs>\s*<\/openrocket>/,
    );
  });

  it('survives two round trips with one copy of each entry', () => {
    const twice = roundTrip(roundTrip(docWith(DESKTOP_DOCPREFS)));
    expect(written(twice)).toHaveLength(8);
  });

  it('round-trips the list of a bundled desktop example', () => {
    const file = readFileSync(resolve(__dirname, '../../../public/examples/a-simple-model-rocket.ork'));
    const data = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const first = importOrk(data);
    expect(first.tree.documentMaterials?.map((m) => m.name)).toEqual([
      'Cardboard',
      'Elastic cord (round 2mm, 1/16 in)',
      'Polystyrene',
      'Ripstop nylon',
    ]);
    const again = importOrk(exportOrk({ name: first.name, tree: first.tree }));
    expect(again.tree.documentMaterials).toEqual(first.tree.documentMaterials);
  });
});
