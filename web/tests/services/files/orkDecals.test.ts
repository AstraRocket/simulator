// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { exportOrk, importOrk } from '../../../src/services/files/orkFile';
import { orkArchive } from '../../../src/services/files/saveOrk';
import { decalFiles, decalPaths } from '../../../src/services/files/ork/exportDecals';
import { decalHash } from '../../../src/services/storage/decalStore';
import { readAppearance } from '../../../src/services/design/appearance';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import { noteTexts } from '../../testing/importNotes';

// jsdom, because importing a design parses XML.

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7]);
const OTHER_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 8, 8, 8]);

// As desktop's `RocketComponentSaver` writes it.
const DECAL = `<decal name="decals/flames.png" rotation="0.5" edgemode="STICKER">
                <center x="0.1" y="0.2"/>
                <offset x="0.3" y="-0.4"/>
                <scale x="2.0" y="0.5"/>
              </decal>`;

const xmlWith = (appearance: string, inside = ''): string => `<?xml version='1.0' encoding='utf-8'?>
<openrocket version="1.10" creator="OpenRocket 24.12">
  <rocket>
    <name>Decals</name>
    <subcomponents>
      <stage>
        <name>Sustainer</name>
        <subcomponents>
          <bodytube>
            <name>Body tube</name>
            <appearance>
              <paint red="200" green="30" blue="40" alpha="255"/>
              <shine>0.3</shine>
              <opacityaffectstexture>false</opacityaffectstexture>
              ${appearance}
            </appearance>
            ${inside}
            <length>0.3</length><thickness>0.001</thickness><outerradius>0.026</outerradius>
          </bodytube>
        </subcomponents>
      </stage>
    </subcomponents>
  </rocket>
</openrocket>`;

const archive = (xml: string, files: Record<string, Uint8Array> = { 'decals/flames.png': PNG }): ArrayBuffer =>
  zipSync({ 'rocket.ork': strToU8(xml), ...files }).slice().buffer as ArrayBuffer;

const tube = (tree: RocketTree): ComponentNode => (tree.components[0]!.children as ComponentNode[])[0]!;

describe('opening a file with a decal', () => {
  const res = importOrk(archive(xmlWith(DECAL)));

  it('reads the placement as AppearanceHandler does, and keys the image by its bytes', () => {
    expect(readAppearance(tube(res.tree)['appearance'])?.decal).toEqual({
      name: 'decals/flames.png',
      hash: decalHash(PNG),
      offset: [0.3, -0.4],
      center: [0.1, 0.2],
      scale: [2, 0.5],
      rotation: 0.5,
      edgeMode: 'STICKER',
    });
  });

  it('hands the image on for the store, once', () => {
    expect(res.decalImages).toEqual([{ hash: decalHash(PNG), bytes: PNG, mime: 'image/png' }]);
  });

  it('says nothing about an image it used', () => {
    expect(noteTexts(res.notes).join('\n')).not.toMatch(/decal/i);
  });

  it('reads a decal on the inside too', () => {
    const inside = `<insideappearance>
              <insidesameasoutside>true</insidesameasoutside>
              <paint red="1" green="2" blue="3" alpha="255"/>
              ${DECAL.replace('flames', 'inner')}
            </insideappearance>`;
    const r = importOrk(archive(xmlWith('', inside), { 'decals/inner.png': OTHER_PNG }));
    expect(readAppearance(tube(r.tree)['insideAppearance'])?.decal?.hash).toBe(decalHash(OTHER_PNG));
  });

  it('keeps the defaults for a number it cannot read, where desktop refuses the file', () => {
    const r = importOrk(archive(xmlWith(DECAL.replace('rotation="0.5"', 'rotation="x"').replace('STICKER', 'WRAP'))));
    const d = readAppearance(tube(r.tree)['appearance'])?.decal;
    expect(d?.rotation).toBe(0);
    expect(d?.edgeMode).toBe('REPEAT');
  });

  it('names a file that is not an image as missing, and keeps the reference', () => {
    const r = importOrk(archive(xmlWith(DECAL), { 'decals/flames.png': strToU8('text') }));
    expect(readAppearance(tube(r.tree)['appearance'])?.decal?.hash).toBeUndefined();
    expect(noteTexts(r.notes).join('\n')).toContain('decals/flames.png');
    expect(r.decalImages).toBeUndefined();
  });
});

describe('saving it', () => {
  const res = importOrk(archive(xmlWith(DECAL)));
  const xml = exportOrk({ name: res.name, tree: res.tree });

  it('writes the decal as RocketComponentSaver does, after the opacity flag', () => {
    expect(xml.replace(/^\s+/gm, '')).toContain(
      '<opacityaffectstexture>false</opacityaffectstexture>\n' +
        '<decal name="decals/flames.png" rotation="0.5" edgemode="STICKER">\n' +
        '<center x="0.1" y="0.2"/>\n<offset x="0.3" y="-0.4"/>\n<scale x="2" y="0.5"/>\n</decal>\n</appearance>',
    );
  });

  it('packs the image at the path the design names it by, and reopens to the same decal', () => {
    const files = decalFiles(decalPaths(res.tree)).map(({ path }) => ({ path, bytes: PNG }));
    const zip = orkArchive({ name: res.name, tree: res.tree }, { decals: files });
    expect(unzipSync(zip)['decals/flames.png']).toEqual(PNG);
    const back = importOrk(zip.slice().buffer as ArrayBuffer);
    expect(readAppearance(tube(back.tree)['appearance'])?.decal).toEqual(
      readAppearance(tube(res.tree)['appearance'])?.decal,
    );
  });

  it('numbers a second, different image uploaded under a name already taken', () => {
    const tree = structuredClone(res.tree);
    const body = tube(tree);
    const outside = readAppearance(body['appearance'])!;
    body['insideAppearance'] = { ...outside, decal: { ...outside.decal!, hash: 'another' } };
    body['separateInsideOutside'] = true;
    const paths = decalPaths(tree);
    expect([...paths.values()]).toEqual(['decals/flames.png', 'decals/flames (1).png']);
    expect(exportOrk({ name: 'x', tree })).toContain('<decal name="decals/flames (1).png"');
  });
});
