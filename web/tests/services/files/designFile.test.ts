// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { gzipSync, zipSync, strToU8 } from 'fflate';
import { parseDesignFile, sniffDesignFormat } from '../../../src/services/files/designFile';
import { MAX_IMPORT_FILE_BYTES } from '../../../src/services/files/decodeText';
import { MAX_AUTO_RADIUS_RUN } from '../../../src/services/files/ork/importLimits';

const RKT = `<?xml version="1.0"?>
<RockSimDocument><FileVersion>4</FileVersion><DesignInformation><RocketDesign>
  <Name>Sniffed</Name><StageCount>1</StageCount>
  <Stage3Parts><BodyTube><Name>Tube</Name><Len>200</Len><OD>24.8</OD><ID>24</ID></BodyTube></Stage3Parts>
</RocketDesign></DesignInformation></RockSimDocument>`;

const ORK = `<?xml version='1.0' encoding='utf-8'?>
<openrocket version="1.10" creator="test">
  <rocket><name>Sniffed ork</name><subcomponents><stage><name>Sustainer</name><subcomponents>
    <bodytube><name>Tube</name><length>0.2</length><radius>0.0124</radius><thickness>0.0004</thickness></bodytube>
  </subcomponents></stage></subcomponents></rocket>
</openrocket>`;

const bytes = (s: string): ArrayBuffer => {
  const u = new TextEncoder().encode(s);
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
};

describe('sniffDesignFormat', () => {
  it('reads a RockSim document from its root element', () => {
    expect(sniffDesignFormat(RKT)).toBe('rkt');
    expect(sniffDesignFormat(bytes(RKT))).toBe('rkt');
  });

  it('reads an OpenRocket document from its root element', () => {
    expect(sniffDesignFormat(ORK)).toBe('ork');
    expect(sniffDesignFormat(bytes(ORK))).toBe('ork');
  });

  it('goes by what a zip holds', () => {
    const zip = zipSync({ 'rocket.ork': strToU8(ORK) });
    expect(sniffDesignFormat(zip.buffer.slice(0) as ArrayBuffer)).toBe('ork');
  });

  it('leaves a corrupt archive to the .ork reader, which words the refusal', () => {
    expect(sniffDesignFormat(new Uint8Array([0x50, 0x4b, 1, 2, 3]).buffer)).toBe('ork');
    expect(sniffDesignFormat(new Uint8Array([0x1f, 0x8b, 1, 2, 3]).buffer)).toBe('ork');
  });

  it.each([
    ['zipped', () => zipSync({ 'ROCKET.RKT': strToU8(RKT) })],
    ['gzipped', () => gzipSync(strToU8(RKT))],
    ['zipped behind another file', () => zipSync({ 'preview.png': strToU8('x'), 'rocket.rkt': strToU8(RKT) })],
  ])('opens a %s RockSim file, as GeneralRocketLoader does', (_, pack) => {
    const packed = pack();
    const data = packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength) as ArrayBuffer;
    expect(sniffDesignFormat(data)).toBe('rkt');
    const res = parseDesignFile(data);
    expect(res.format).toBe('rkt');
    expect(res.name).toBe('Sniffed');
  });

  it('is not fooled by the word RockSim inside a .ork', () => {
    const ork = ORK.replace('<name>Tube</name>', '<name>Tube</name><material>RockSim Kraft phenolic</material>');
    expect(sniffDesignFormat(ork)).toBe('ork');
  });

  describe('a file written in UTF-16', () => {
    const utf16 = (text: string, { be = false, bom = true } = {}): ArrayBuffer => {
      const u = new Uint8Array((text.length + (bom ? 1 : 0)) * 2);
      const view = new DataView(u.buffer);
      let i = 0;
      if (bom) view.setUint16(i++ * 2, 0xfeff, !be);
      for (const ch of text) view.setUint16(i++ * 2, ch.charCodeAt(0), !be);
      return u.buffer;
    };

    it('reads a little-endian RockSim document', () => {
      expect(sniffDesignFormat(utf16(RKT))).toBe('rkt');
      expect(parseDesignFile(utf16(RKT)).name).toBe('Sniffed');
    });

    it('reads a big-endian OpenRocket document', () => {
      expect(sniffDesignFormat(utf16(ORK, { be: true }))).toBe('ork');
      expect(parseDesignFile(utf16(ORK, { be: true })).name).toBe('Sniffed ork');
    });

    it('reads one with no byte order mark, from the shape of its first tag', () => {
      expect(sniffDesignFormat(utf16(ORK, { bom: false }))).toBe('ork');
      expect(sniffDesignFormat(utf16(RKT, { be: true, bom: false }))).toBe('rkt');
    });

    it('still reads plain UTF-8, mark or no mark', () => {
      const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(ORK)]);
      expect(sniffDesignFormat(withBom.buffer.slice(0) as ArrayBuffer)).toBe('ork');
      expect(sniffDesignFormat(bytes(ORK))).toBe('ork');
    });
  });

  it('says nothing for a file that is neither', () => {
    expect(sniffDesignFormat('<html><body>nope</body></html>')).toBeNull();
    expect(sniffDesignFormat('')).toBeNull();
  });
});

describe('parseDesignFile', () => {
  it('routes each format to its own reader', () => {
    expect(parseDesignFile(RKT).name).toBe('Sniffed');
    expect(parseDesignFile(ORK).name).toBe('Sniffed ork');
  });

  it('gives both readers the same result shape', () => {
    // `loadOrk` needs a `.rkt` config table present and empty, not missing.
    const r = parseDesignFile(RKT);
    expect(r.configs).toEqual([]);
    expect(r.chosenConfigId).toBeNull();
    expect(r.motors).toEqual({});
  });

  it('names both formats when handed something else', () => {
    expect(() => parseDesignFile('<html/>')).toThrow(/OpenRocket \(\.ork\) or RockSim \(\.rkt\)/);
  });

  const oversized = (root: string): ArrayBuffer => {
    const bytes = new Uint8Array(MAX_IMPORT_FILE_BYTES + 1).fill(0x20);
    bytes.set(strToU8(root));
    return bytes.buffer;
  };

  it('refuses an oversized bare-XML .ork before decoding it', () => {
    expect(() => parseDesignFile(oversized('<openrocket version="1.10">'))).toThrow(/too large/);
  });

  it('refuses an oversized .rkt before decoding it', () => {
    expect(() => parseDesignFile(oversized('<RockSimDocument>'))).toThrow(/too large/);
  });

  it('refuses oversized design text', () => {
    expect(() => parseDesignFile('<openrocket>' + ' '.repeat(MAX_IMPORT_FILE_BYTES))).toThrow(/too large/);
  });
});

// Desktop still reads gzipped XML (`GeneralRocketLoader.loadStep1`).
describe('a gzipped .ork', () => {
  const gz = (data: Uint8Array): ArrayBuffer => {
    const out = gzipSync(data);
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  };

  it('is sniffed and read as a .ork', () => {
    const file = gz(strToU8(ORK));
    expect(sniffDesignFormat(file)).toBe('ork');
    expect(parseDesignFile(file).name).toBe('Sniffed ork');
  });

  it('is refused once it inflates past the cap', () => {
    expect(() => parseDesignFile(gz(new Uint8Array(65 * 1024 * 1024)))).toThrow(/too large/);
  });
});

// A crafted file of under 1 KB: each count is inside its own cap, but nesting multiplies them.
describe('a design whose nested counts multiply out too far', () => {
  const pods = (levels: number) => {
    const tube = (inner = '') =>
      `<bodytube><name>Tube</name><length>0.1</length><radius>0.01</radius><subcomponents>${inner}</subcomponents></bodytube>`;
    // A pod set sits on a tube, so each level is a tube carrying 64 pods.
    let inner = tube();
    for (let i = 0; i < levels; i++) {
      inner = tube(
        `<podset><name>Pods</name><instancecount>64</instancecount><subcomponents>${inner}</subcomponents></podset>`,
      );
    }
    return ORK.replace(/<bodytube>.*<\/bodytube>/s, inner);
  };

  it('is refused before the engine builds it', () => {
    expect(() => parseDesignFile(pods(3))).toThrow(expect.objectContaining({ key: 'errors.file.tooManyInstances' }));
  });

  it('still opens with two levels of 64 pods', () => {
    expect(parseDesignFile(pods(2)).tree.components).toHaveLength(1);
  });
});

// Each automatic radius walks back to a sized part, so a long run stalls the build.
describe('a design with a long run of automatic radii', () => {
  const run = (autos: number) => {
    const tube = (r: string) => `<bodytube><name>Tube</name><length>0.1</length><radius>${r}</radius></bodytube>`;
    return ORK.replace(/<bodytube>.*<\/bodytube>/s, tube('0.01') + tube('auto').repeat(autos));
  };

  it('opens at the cap', () => {
    expect(parseDesignFile(run(MAX_AUTO_RADIUS_RUN)).tree.components[0]?.children).toHaveLength(
      MAX_AUTO_RADIUS_RUN + 1,
    );
  });

  it('is refused one past it', () => {
    expect(() => parseDesignFile(run(MAX_AUTO_RADIUS_RUN + 1))).toThrow(
      expect.objectContaining({ key: 'errors.file.autoRadiusRunTooLong' }),
    );
  });
});
