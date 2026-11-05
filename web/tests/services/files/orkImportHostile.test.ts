// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { importOrk } from '../../../src/services/files/orkFile';
import { MAX_MOTOR_CONFIGS, MAX_NESTING_DEPTH, MAX_SIMULATIONS } from '../../../src/services/files/ork/importLimits';

const ork = (xml: string): ArrayBuffer => {
  const zipped = zipSync({ 'rocket.ork': strToU8(xml) });
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
};

/** Rewrites the central-directory uncompressed size (record offset 24) to `bytes`. */
const declaringSize = (zip: ArrayBuffer, bytes: number): ArrayBuffer => {
  const out = new Uint8Array(zip.slice(0));
  for (let i = 0; i + 28 <= out.length; i++) {
    if (out[i] === 0x50 && out[i + 1] === 0x4b && out[i + 2] === 0x01 && out[i + 3] === 0x02) {
      new DataView(out.buffer).setUint32(i + 24, bytes, true);
      return out.buffer;
    }
  }
  throw new Error('no central directory entry in the test archive');
};

const wrap = (inner: string) =>
  `<?xml version="1.0"?><openrocket version="1.8"><rocket><name>T</name><subcomponents><stage><name>S</name><subcomponents>${inner}</subcomponents></stage></subcomponents></rocket></openrocket>`;

describe('a well-formed .ork still imports', () => {
  it('reads a minimal rocket', () => {
    const res = importOrk(
      ork(wrap('<bodytube><name>Body</name><length>0.3</length><radius>0.012</radius></bodytube>')),
    );
    expect(res.tree.components.length).toBeGreaterThan(0);
  });
});

describe('malformed input fails cleanly rather than crashing', () => {
  it('rejects something that is not a zip at all', () => {
    expect(() => importOrk(strToU8('not a zip').buffer as ArrayBuffer)).toThrow();
  });

  it('rejects a zip with no rocket document', () => {
    const zipped = zipSync({ 'readme.txt': strToU8('hello') });
    const buf = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
    expect(() => importOrk(buf as ArrayBuffer)).toThrow();
  });

  it('rejects XML that is not a rocket', () => {
    expect(() => importOrk(ork('<?xml version="1.0"?><spreadsheet/>'))).toThrow();
  });

  it('rejects truncated XML', () => {
    expect(() => importOrk(ork('<?xml version="1.0"?><openrocket><rocket><name>T'))).toThrow();
  });
});

describe('the hostile-input caps actually fire', () => {
  it('refuses nesting past MAX_NESTING_DEPTH with a clear error', () => {
    const depth = 150;
    const open = '<subcomponents><bodytube><name>b</name><length>0.1</length><radius>0.01</radius>'.repeat(depth);
    const close = '</bodytube></subcomponents>'.repeat(depth);
    const xml = `<?xml version="1.0"?><openrocket version="1.8"><rocket><name>T</name><subcomponents><stage><name>S</name>${open}${close}</stage></subcomponents></rocket></openrocket>`;
    expect(() => importOrk(ork(xml))).toThrow(/nest|deep/i);
  });

  // Own timeout: parsing ten thousand parts can run ten times slower on a loaded CI runner.
  it('refuses more components than MAX_COMPONENTS with a clear error', () => {
    const many = '<bodytube><name>b</name><length>0.1</length><radius>0.01</radius></bodytube>'.repeat(10_050);
    expect(() => importOrk(ork(wrap(many)))).toThrow(/too many components/i);
  }, 60_000);

  const withSims = (n: number) =>
    ork(
      `<?xml version="1.0"?><openrocket version="1.8"><rocket><name>T</name><subcomponents><stage><name>S</name><subcomponents>` +
        `<bodytube><name>b</name><length>0.1</length><radius>0.01</radius></bodytube></subcomponents></stage></subcomponents></rocket>` +
        `<simulations>${'<simulation/>'.repeat(n)}</simulations></openrocket>`,
    );

  it('refuses more simulations than MAX_SIMULATIONS with a clear error', () => {
    expect(() => importOrk(withSims(MAX_SIMULATIONS + 1))).toThrow(/too many simulations/i);
  });

  it('still opens a file with as many simulations as the cap allows', () => {
    expect(importOrk(withSims(MAX_SIMULATIONS)).simulations).toHaveLength(MAX_SIMULATIONS);
  });

  it('still accepts a component count a real design could plausibly use', () => {
    const many = '<bodytube><name>b</name><length>0.1</length><radius>0.01</radius></bodytube>'.repeat(200);
    const res = importOrk(ork(wrap(many)));
    expect(res.tree.components[0]?.children?.length).toBe(200);
  });

  // The stage plus 29 levels of parts is 30 levels, the most the kernel builds.
  const nested = (depth: number) => {
    const open = '<subcomponents><bodytube><name>b</name><length>0.1</length><radius>0.01</radius>'.repeat(depth);
    const close = '</bodytube></subcomponents>'.repeat(depth);
    return ork(
      `<?xml version="1.0"?><openrocket version="1.8"><rocket><name>T</name><subcomponents><stage><name>S</name>${open}${close}</stage></subcomponents></rocket></openrocket>`,
    );
  };
  it('accepts nesting up to the kernel limit, and refuses one level more', () => {
    expect(() => importOrk(nested(MAX_NESTING_DEPTH))).not.toThrow();
    expect(() => importOrk(nested(MAX_NESTING_DEPTH + 1))).toThrow(/nest|deep/i);
  });

  it('still accepts nesting a real design could plausibly use', () => {
    const depth = 8;
    const open = '<subcomponents><bodytube><name>b</name><length>0.1</length><radius>0.01</radius>'.repeat(depth);
    const close = '</bodytube></subcomponents>'.repeat(depth);
    const xml = `<?xml version="1.0"?><openrocket version="1.8"><rocket><name>T</name><subcomponents><stage><name>S</name>${open}${close}</stage></subcomponents></rocket></openrocket>`;
    expect(() => importOrk(ork(xml))).not.toThrow();
  });

  it('opens a member whose declared size is larger than what it holds', () => {
    const small = ork(wrap('<bodytube><name>b</name><length>0.1</length><radius>0.01</radius></bodytube>'));
    expect(importOrk(declaringSize(small, 65 * 1024 * 1024)).tree.components[0]?.children).toHaveLength(1);
  });

  const withConfigs = (n: number) => {
    const configs = Array.from(
      { length: n },
      (_, i) => `<motorconfiguration configid="c${i}"><name>C${i}</name></motorconfiguration>`,
    ).join('');
    return ork(
      `<?xml version="1.0"?><openrocket version="1.8"><rocket><name>T</name>${configs}` +
        `<subcomponents><stage><name>S</name><subcomponents>` +
        `<bodytube><name>Body</name><length>0.3</length><radius>0.012</radius></bodytube>` +
        `</subcomponents></stage></subcomponents></rocket></openrocket>`,
    );
  };

  it('refuses more declared configurations than MAX_MOTOR_CONFIGS', () => {
    expect(() => importOrk(withConfigs(MAX_MOTOR_CONFIGS + 1))).toThrow(/too many flight configurations/i);
  });

  it('opens a file with as many configurations as the cap allows, in file order', () => {
    const res = importOrk(withConfigs(MAX_MOTOR_CONFIGS));
    expect(res.configs).toHaveLength(MAX_MOTOR_CONFIGS);
    expect(res.configs[0]!.id).toBe('c0');
    expect(res.configs.some((c) => c.id === res.chosenConfigId)).toBe(true);
  });

  it('keeps every configuration of a file that stays under the cap', () => {
    const configs = Array.from(
      { length: 12 },
      (_, i) => `<motorconfiguration configid="c${i}"><name>C${i}</name></motorconfiguration>`,
    ).join('');
    const xml =
      `<?xml version="1.0"?><openrocket version="1.8"><rocket><name>T</name>${configs}` +
      `<subcomponents><stage><name>S</name><subcomponents>` +
      `<bodytube><name>Body</name><length>0.3</length><radius>0.012</radius></bodytube>` +
      `</subcomponents></stage></subcomponents></rocket></openrocket>`;
    expect(importOrk(ork(xml)).configs).toHaveLength(12);
  });

  it('keeps one configuration for a repeated configid, as the desktop does', () => {
    const configs =
      `<motorconfiguration configid="a"><name>First</name></motorconfiguration>` +
      `<motorconfiguration configid="b"/>` +
      `<motorconfiguration configid="a" default="true"><name>Renamed</name></motorconfiguration>`;
    const xml =
      `<?xml version="1.0"?><openrocket version="1.8"><rocket><name>T</name>${configs}` +
      `<subcomponents><stage><name>S</name><subcomponents>` +
      `<bodytube><name>Body</name><length>0.3</length><radius>0.012</radius></bodytube>` +
      `</subcomponents></stage></subcomponents></rocket></openrocket>`;
    const res = importOrk(ork(xml));
    expect(res.configs.map((c) => c.id)).toEqual(['a', 'b']);
    // createFlightConfiguration returns the existing one, so the later name lands on it.
    expect(res.configs[0]!.name).toBe('Renamed');
    expect(res.chosenConfigId).toBe('a');
  });

  it('refuses a zip with more entries than the cap allows', () => {
    const entries: Record<string, Uint8Array> = {};
    for (let i = 0; i < 300; i++) entries[`f${i}.txt`] = strToU8('x'); // cap is 256
    const zipped = zipSync(entries);
    const buf = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
    // A bare `.toThrow()` would also pass on "Empty .ork archive" with no cap.
    expect(() => importOrk(buf as ArrayBuffer)).toThrow('.ork archive has too many entries');
  });
});

describe('file-sourced counts are clamped to domain ceilings', () => {
  const inTube = (inner: string) =>
    wrap(
      `<bodytube><name>Body</name><length>0.3</length><radius>0.012</radius><subcomponents>${inner}</subcomponents></bodytube>`,
    );
  const findType = (components: unknown, type: string) => {
    const walk = (ns: { type: string; children?: unknown[] }[]): Record<string, unknown> | undefined => {
      for (const n of ns) {
        if (n.type === type) return n as Record<string, unknown>;
        const hit = walk((n.children ?? []) as { type: string; children?: unknown[] }[]);
        if (hit) return hit;
      }
      return undefined;
    };
    return walk(components as never)!;
  };
  const first = (xml: string, type: string) => findType(importOrk(ork(xml)).tree.components, type);

  // 8 is the kernel's limit, which desktop also applies on load.
  it('caps a fin count at 8 and floors it at 1', () => {
    const fins = (n: string) =>
      `<trapezoidfinset><name>F</name><fincount>${n}</fincount><rootchord>0.05</rootchord><height>0.03</height></trapezoidfinset>`;
    expect(first(inTube(fins('100000')), 'trapezoidfinset').finCount).toBe(8);
    expect(first(inTube(fins('9')), 'trapezoidfinset').finCount).toBe(8);
    expect(first(inTube(fins('0')), 'trapezoidfinset').finCount).toBe(1);
    expect(first(inTube(fins('-7')), 'trapezoidfinset').finCount).toBe(1);
    expect(first(inTube(fins('Infinity')), 'trapezoidfinset').finCount).toBe(3);
    expect(first(inTube(fins('4')), 'trapezoidfinset').finCount).toBe(4);
    const tubes = `<tubefinset><name>T</name><fincount>9999</fincount><length>0.1</length></tubefinset>`;
    expect(first(inTube(tubes), 'tubefinset').finCount).toBe(8);
  });

  // ComponentFactory.MAX_INSTANCE_COUNT; past it every build fails.
  it('caps an instance count at 64 on rings, lugs and assemblies', () => {
    const ring = `<centeringring><name>R</name><instancecount>1000000</instancecount><length>0.002</length></centeringring>`;
    expect(first(inTube(ring), 'centeringring').instanceCount).toBe(64);
    const lug = `<launchlug><name>L</name><instancecount>5000</instancecount><length>0.03</length></launchlug>`;
    expect(first(inTube(lug), 'launchlug').instanceCount).toBe(64);
    const pod =
      `<podset><name>P</name><instancecount>1e12</instancecount><subcomponents>` +
      `<bodytube><length>0.1</length><radius>0.005</radius></bodytube></subcomponents></podset>`;
    expect(first(inTube(pod), 'podset').instanceCount).toBe(64);
  });

  // Own timeout: jsdom's DOMParser on a megabyte of XML can pass 5 s under suite load.
  it('caps a freeform outline at 10000 points', () => {
    const n = 20_000;
    const pts = Array.from({ length: n }, (_, i) => `<point x="${(i / n) * 0.06}" y="${i % 2 ? 0.03 : 0.0}"/>`).join(
      '',
    );
    const fin = `<freeformfinset><name>F</name><fincount>3</fincount><finpoints>${pts}</finpoints></freeformfinset>`;
    const res = importOrk(ork(inTube(fin)));
    expect(findType(res.tree.components, 'freeformfinset').points).toHaveLength(10_000);
    expect(res.notes).toContainEqual({ key: 'importNote.finPointsCapped', values: { max: 10_000 } });
  }, 60_000);

  it('raises no cap note for an outline at the cap', () => {
    const pts = Array.from({ length: 10_000 }, (_, i) => `<point x="${i * 1e-5}" y="${i % 2 ? 0.03 : 0}"/>`).join('');
    const fin = `<freeformfinset><name>F</name><fincount>3</fincount><finpoints>${pts}</finpoints></freeformfinset>`;
    const res = importOrk(ork(inTube(fin)));
    expect(res.notes).not.toContainEqual(expect.objectContaining({ key: 'importNote.finPointsCapped' }));
  }, 60_000);

  // Desktop keeps a 0 (`Parachute.setLineCount`); the cap is ComponentFactory.MAX_LINE_COUNT.
  it('caps a parachute line count at 1024, and keeps a 0', () => {
    const chute = `<parachute><name>C</name><diameter>0.3</diameter><linecount>100000</linecount></parachute>`;
    expect(first(inTube(chute), 'parachute').lineCount).toBe(1024);
    const none = `<parachute><name>C</name><diameter>0.3</diameter><linecount>0</linecount></parachute>`;
    expect(first(inTube(none), 'parachute').lineCount).toBe(0);
  });
});
