import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

// On WASM-GC a trap bypasses every Java catch, so the input bounds must fire first.

/* eslint-disable @typescript-eslint/no-explicit-any -- the TeaVM bundle is untyped */

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_ENGINE = join(here, '..', '..', 'public', 'engine');

let wasm: any;
let js: any;

async function loadWasm(): Promise<any> {
  const g = globalThis as any;
  g.$rt_putStdoutCustom ??= () => {};
  g.$rt_putStderrCustom ??= () => {};
  if (!g.TeaVM?.wasmGC) {
    await import(pathToFileURL(join(PUBLIC_ENGINE, 'openrocket-engine.wasm-runtime.js')).href);
  }
  const bytes = readFileSync(join(PUBLIC_ENGINE, 'openrocket-engine.wasm'));
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const teavm = await g.TeaVM.wasmGC.load(buf);
  return teavm.exports;
}

const NOSE = { type: 'nosecone', id: 'n', shape: 'ogive', length: 0.07, aftRadius: 0.013, thickness: 0.001 };
const TUBE = { type: 'bodytube', id: 'b', length: 0.3, outerRadius: 0.013, thickness: 0.0005 };
const MOUNT = { type: 'bodytube', id: 'm', length: 0.1, outerRadius: 0.013, thickness: 0.0005, motorMount: true };
const tree = (extra: unknown[] = []) => JSON.stringify({ components: [NOSE, TUBE, ...extra] });

function outcome(fn: () => unknown): { kind: 'threw' | 'envelope' | 'ok'; message: string } {
  try {
    const r = fn();
    if (typeof r === 'string' && r.includes('"error"')) {
      return { kind: 'envelope', message: String(JSON.parse(r).error) };
    }
    return { kind: 'ok', message: typeof r === 'string' ? r.slice(0, 120) : String(r) };
  } catch (e) {
    return { kind: 'threw', message: e instanceof Error ? e.message : String(e) };
  }
}

beforeAll(async () => {
  wasm = await loadWasm();
  js = await import('../../src/engine/vendor/openrocket-engine.mjs');
}, 120_000);

describe('the harness is really driving WASM', () => {
  it('loaded a distinct module through TeaVM.wasmGC', () => {
    expect(wasm).toBeTruthy();
    expect(js).toBeTruthy();
    expect(wasm).not.toBe(js);
    expect((globalThis as any).TeaVM?.wasmGC?.load).toBeTypeOf('function');
    expect(Object.prototype.toString.call(js)).toBe('[object Module]');
    expect(Object.prototype.toString.call(wasm)).not.toBe('[object Module]');
  });

  it('the two modules hold independent handle tables', () => {
    js.reset();
    wasm.reset();
    const jsHandle = js.buildRocket(tree());
    wasm.reset();
    expect(() => JSON.parse(js.getStaticInfo(jsHandle))).not.toThrow();
    expect(JSON.parse(js.getStaticInfo(jsHandle)).error).toBeUndefined();
  });
});

describe('the shipped WASM-GC build enforces the same input bounds as JS', () => {
  const cases: Array<[name: string, call: (e: any) => unknown, expected: RegExp]> = [
    [
      'JSON nested past MAX_DEPTH is refused, not a stack overflow',
      (e) => e.buildRocket(`{"components":${'['.repeat(4000)}${']'.repeat(4000)}}`),
      /nesting deeper than/,
    ],
    [
      'a non-finite numeric literal is refused',
      (e) => e.buildRocket('{"components":[{"type":"bodytube","id":"b1","length":1e999,"outerRadius":0.012}]}'),
      /non-finite/,
    ],
    [
      'an uncapped instance count is refused',
      (e) =>
        e.buildRocket(
          tree([
            {
              type: 'bodytube',
              id: 'h',
              length: 0.2,
              outerRadius: 0.013,
              children: [{ type: 'podset', id: 'p', instanceCount: 100000 }],
            },
          ]),
        ),
      /instanceCount/,
    ],
    [
      'a wind level with no usable altitude is refused, not flown at 0 m',
      (e) => {
        const h = e.buildRocket(tree([MOUNT]));
        e.setMotorById(h, 'm', 'C6', 0.018, 0.07, [0, 1, 2], [0, 6, 0], [0.024, 0.018, 0.012], 0.035, 5);
        return e.simulateJson(
          h,
          JSON.stringify({
            launchRodLength: 1,
            randomSeed: 7,
            windLevels: [{ speed: 4, direction: Math.PI / 2, stddev: 0 }],
          }),
        );
      },
      /altitude/i,
    ],
    [
      'two wind levels at one altitude are refused by name',
      (e) => {
        const h = e.buildRocket(tree([MOUNT]));
        e.setMotorById(h, 'm', 'C6', 0.018, 0.07, [0, 1, 2], [0, 6, 0], [0.024, 0.018, 0.012], 0.035, 5);
        const level = (altitude: number, speed: number) => ({ altitude, speed, direction: Math.PI / 2, stddev: 0 });
        return e.simulateJson(
          h,
          JSON.stringify({ launchRodLength: 1, randomSeed: 7, windLevels: [level(0, 4), level(0, 9)] }),
        );
      },
      /repeat|level 2/i,
    ],
    [
      'an over-large aero sweep is refused',
      (e) => {
        const h = e.buildRocket(tree());
        return e.getAeroSweep(h, JSON.stringify({ machMin: 0, machMax: 1e9, machStep: 0.05 }));
      },
      /exceeds|over the/,
    ],
    [
      'a sweep whose point count overflows a long is refused, not returned empty',
      (e) => {
        const h = e.buildRocket(tree());
        // `(long) Infinity + 1` wraps negative, so a `points > MAX` guard alone passes.
        return e.getAeroSweep(h, JSON.stringify({ machMin: 0, machMax: 1, machStep: 5e-324 }));
      },
      /infinite|over the/,
    ],
    [
      'a sweep whose span overflows a double is refused, not returned empty',
      (e) => {
        const h = e.buildRocket(tree());
        return e.getAeroSweep(h, JSON.stringify({ machMin: -1.7e308, machMax: 1.7e308, machStep: 0.05 }));
      },
      /infinite|over the/,
    ],
  ];

  it.each(cases)('%s', (_name, call, expected) => {
    wasm.reset();
    const got = outcome(() => call(wasm));
    expect(got.kind, `expected a refusal, got ${got.kind}: ${got.message}`).not.toBe('ok');
    expect(got.message).toMatch(expected);
  });

  it('a sub-ulp sweep step terminates instead of looping forever', () => {
    wasm.reset();
    const h = wasm.buildRocket(tree());
    // Returning is the assertion: without the integer point-count guard this hangs.
    const out = JSON.parse(wasm.getAeroSweep(h, JSON.stringify({ machMin: 0.05, machMax: 0.05, machStep: 1e-300 })));
    expect(out.machs).toEqual([0.05]);
  });

  it('a non-finite ignition delay is refused by the kernel itself, not only by the wrapper', () => {
    wasm.reset();
    const h = wasm.buildRocket(tree([MOUNT]));
    wasm.setMotorById(h, 'm', 'C6', 0.018, 0.07, [0, 1, 2], [0, 6, 0], [0.024, 0.018, 0.012], 0.035, 5);
    // Returns void, so a refusal must throw.
    for (const bad of [Infinity, -Infinity, NaN]) {
      const got = outcome(() => wasm.setMotorIgnitionById(h, 'm', 'launch', bad));
      expect(got.kind, `delay ${bad}: expected a throw, got ${got.kind}: ${got.message}`).toBe('threw');
      expect(got.message).toMatch(/ignitionDelay|finite/);
    }
    expect(outcome(() => wasm.setMotorIgnitionById(h, 'm', 'launch', 1)).kind).toBe('ok');
  });
});

describe('both targets agree on the errors the facade can actually report', () => {
  const enveloped: Array<[name: string, call: (e: any) => unknown]> = [
    ['an unknown handle', (e) => e.simulateJson(99999, '{}')],
    ['a malformed options blob', (e) => e.simulateJson(e.buildRocket(tree()), '{oops')],
    ['an unknown component id', (e) => e.getComponentInfo(e.buildRocket(tree()), 'nope')],
    ['a machAlt row that is not a pair', (e) => e.getAeroSweep(e.buildRocket(tree()), '{"machAlt":["a"]}')],
    ['a machAlt row of strings', (e) => e.getAeroSweep(e.buildRocket(tree()), '{"machAlt":[[0.5,0],["x","y"]]}')],
  ];

  it.each(enveloped)('%s reports identically on JS and WASM', (_name, call) => {
    js.reset();
    wasm.reset();
    const a = outcome(() => call(js));
    const b = outcome(() => call(wasm));
    expect(b.kind).toBe(a.kind);
    expect(b.message).toBe(a.message);
  });

  it('names the field and the row for a bad machAlt table, on both', () => {
    for (const e of [js, wasm]) {
      e.reset();
      const got = outcome(() => e.getAeroSweep(e.buildRocket(tree()), '{"machAlt":[[0.5,0],["x","y"]]}'));
      expect(got.kind).toBe('envelope');
      expect(got.message).toMatch(/'machAlt' row 1/);
    }
  });
});

describe('the shipped build computes what the JS build computes', () => {
  it('same rocket, same static info', () => {
    js.reset();
    wasm.reset();
    const a = JSON.parse(js.getStaticInfo(js.buildRocket(tree())));
    const b = JSON.parse(wasm.getStaticInfo(wasm.buildRocket(tree())));
    expect(b.mass).toBeCloseTo(a.mass, 12);
    expect(b.cg).toBeCloseTo(a.cg, 12);
    expect(b.cp).toBeCloseTo(a.cp, 12);
  });

  // Cross-target equality is not asserted: turbulence compounds ULP drift.
  it('gives one turbulent wind profile the same flight twice at one seed', () => {
    const fly = (randomSeed: number) => {
      wasm.reset();
      const h = wasm.buildRocket(tree([MOUNT]));
      wasm.setMotorById(h, 'm', 'C6', 0.018, 0.07, [0, 1, 2], [0, 6, 0], [0.024, 0.018, 0.012], 0.035, 5);
      const out = JSON.parse(
        wasm.simulateJson(
          h,
          JSON.stringify({
            launchRodLength: 1,
            randomSeed,
            windLevels: [
              { altitude: 0, speed: 6, direction: Math.PI / 2, stddev: 2 },
              { altitude: 600, speed: 14, direction: Math.PI / 2, stddev: 4 },
            ],
          }),
        ),
      );
      expect(out.error).toBeUndefined();
      return out.summary.maxAltitude as number;
    };

    const first = fly(7);
    expect(first).toBeGreaterThan(0);
    expect(fly(7)).toBe(first);
    expect(fly(8)).not.toBe(first);
  });
});
