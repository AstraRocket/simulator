// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { exportOrk, importOrk } from '../../../src/services/files/orkFile';
import { PHOTO_DEFAULTS, photoSettingsMap, readPhotoSettings } from '../../../src/services/design/photoSettings';

// jsdom, because importing a design parses XML.

// As desktop's `PhotoStudioSaver` writes it.
const PHOTO = `  <photostudio>
    <roll>0.5</roll>
    <yaw>1.25</yaw>
    <sunlight red="250" green="240" blue="230" alpha="255"/>
    <skyColor red="10" green="20" blue="30"/>
    <flame>true</flame>
    <sky>info.openrocket.swing.gui.figure3d.photo.sky.builtin.Miramar</sky>
  </photostudio>`;

const ork = (extra: string): string => `<?xml version='1.0' encoding='utf-8'?>
<openrocket version="1.10" creator="OpenRocket 24.12">
  <rocket>
    <name>Photo</name>
    <subcomponents>
      <stage>
        <name>Sustainer</name>
        <subcomponents>
          <bodytube><name>Body</name><length>0.3</length><outerradius>0.026</outerradius></bodytube>
        </subcomponents>
      </stage>
    </subcomponents>
  </rocket>
  <simulations/>
${extra}
</openrocket>`;

describe('Photo Studio settings in a file', () => {
  it('are read as PhotoStudioHandler keeps them: text, and colors as their channels', () => {
    expect(importOrk(ork(PHOTO)).tree.photoStudio).toEqual({
      roll: '0.5',
      yaw: '1.25',
      sunlight: '250 240 230 255',
      skyColor: '10 20 30 255',
      flame: 'true',
      sky: 'info.openrocket.swing.gui.figure3d.photo.sky.builtin.Miramar',
    });
  });

  it('read as desktop applies them', () => {
    expect(readPhotoSettings(importOrk(ork(PHOTO)).tree.photoStudio)).toMatchObject({
      roll: 0.5,
      yaw: 1.25,
      flame: true,
      sky: 'Miramar',
      backgroundType: 'TEXTURE',
      sunlight: [250, 240, 230, 255],
    });
  });

  it('go back out as they came in, in PhotoStudioSaver order, after the simulations', () => {
    const res = importOrk(ork(PHOTO));
    const out = exportOrk({ name: res.name, tree: res.tree }).replace(/^\s+/gm, '');
    expect(out).toContain(
      '<photostudio>\n<roll>0.5</roll>\n<yaw>1.25</yaw>\n<sunlight red="250" green="240" blue="230" alpha="255"/>\n' +
        '<skyColor red="10" green="20" blue="30" alpha="255"/>\n<flame>true</flame>\n' +
        '<sky>info.openrocket.swing.gui.figure3d.photo.sky.builtin.Miramar</sky>\n</photostudio>',
    );
    expect(out.indexOf('<photostudio>')).toBeGreaterThan(out.indexOf('<simulations'));
    expect(out.match(/<photostudio>/g)).toHaveLength(1);
  });

  it('written in full once edited, as desktop does', () => {
    const res = importOrk(ork(PHOTO));
    const tree = { ...res.tree, photoStudio: photoSettingsMap(PHOTO_DEFAULTS, res.tree.photoStudio) };
    const back = importOrk(exportOrk({ name: res.name, tree }));
    expect(readPhotoSettings(back.tree.photoStudio)).toEqual(readPhotoSettings(tree.photoStudio));
    expect(Object.keys(back.tree.photoStudio ?? {})).toHaveLength(29);
  });

  it('leave a design without them without them', () => {
    const res = importOrk(ork(''));
    expect(res.tree.photoStudio).toBeUndefined();
    expect(exportOrk({ name: res.name, tree: res.tree })).not.toContain('photostudio');
  });
});
