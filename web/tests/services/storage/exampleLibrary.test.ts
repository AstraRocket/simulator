// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { importOrk } from '../../../src/services/files/orkFile';
import { matchCatalogMotor, type CatalogMotor } from '../../../src/services/motors/motorDb';
import { __setEngineForTests, OpenRocketDesign } from '../../../src/engine/openRocketEngine';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

// `import.meta.url` is not a file: URL under jsdom, so paths hang off cwd (`web/`).
const PUBLIC = resolve(process.cwd(), 'public');
const EXAMPLES = join(PUBLIC, 'examples');

interface Entry {
  id: string;
  file: string;
  name: string;
  description: string | null;
  bytes: number;
}

const index: { source: { repo: string; ref: string }; examples: Entry[] } = JSON.parse(
  readFileSync(join(EXAMPLES, 'examples.generated.json'), 'utf8'),
);
const catalog: CatalogMotor[] = JSON.parse(readFileSync(join(PUBLIC, 'data/motors.generated.json'), 'utf8'));

// A fresh ArrayBuffer, not a view into node's pooled Buffer.
function read(file: string): ArrayBuffer {
  const b = readFileSync(join(EXAMPLES, file));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

beforeAll(async () => {
  __setEngineForTests(await import('../../../src/engine/vendor/openrocket-engine.mjs'));
});

describe('the bundled examples index', () => {
  it('is pinned to the same upstream the engine was extracted from', () => {
    const upstream = readFileSync(resolve(process.cwd(), '../engine-java/extract/UPSTREAM'), 'utf8');
    expect(index.source.ref).toBe(upstream.match(/^ref\s*=\s*(\S+)/m)?.[1]);
  });

  it('lists every file it ships, and ships every file it lists', () => {
    expect(index.examples.length).toBeGreaterThan(0);
    for (const e of index.examples) expect(existsSync(join(EXAMPLES, e.file)), e.file).toBe(true);
  });

  it('gives each one a name and an id that match its file', () => {
    for (const e of index.examples) {
      expect(e.name.trim(), e.id).not.toBe('');
      expect(e.file).toBe(`${e.id}.ork`);
    }
  });

  it('keeps the whole set small enough to precache', () => {
    const total = index.examples.reduce((n, e) => n + e.bytes, 0);
    expect(total).toBeLessThan(1_500_000);
  });
});

describe.each(index.examples.map((e) => [e.name, e] as const))('example: %s', (_name, e) => {
  it('imports, builds and has a flyable motor', () => {
    const res = importOrk(read(e.file));

    expect([...(res.ignored ?? [])]).toEqual([]);
    expect(res.tree.components.length).toBeGreaterThan(0);

    const info = OpenRocketDesign.buildTree(res.tree).staticInfo();
    for (const [key, v] of Object.entries({
      length: info.length,
      mass: info.mass,
      cg: info.cg,
      cp: info.cp,
    })) {
      expect(Number.isFinite(v), `${key} = ${v}`).toBe(true);
      expect(v, key).toBeGreaterThan(0);
    }

    const motors = Object.values(res.motors ?? {});
    expect(motors.length, 'no motor in the file').toBeGreaterThan(0);
    for (const m of motors) {
      const hit = matchCatalogMotor(catalog, m.designation, m.manufacturer)?.motor;
      expect(hit, `${m.designation} (${m.manufacturer ?? '?'})`).toBeTruthy();
      expect(hit?.noCurve ?? false, `${m.designation} has no thrust curve`).toBe(false);
    }
  });
});
