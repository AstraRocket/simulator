// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { catalogDigest, loadCatalog, type CatalogMotor } from '../../../src/services/motors/motorDb';
import { buildExportMotorMap, fillMotorDigests } from '../../../src/services/motors/exportMotors';
import { newFlightConfig, type MountMotor } from '../../../src/services/flight/flightConfigs';
import { exportOrk, importOrk, type OrkExportMotor } from '../../../src/services/files/orkFile';
import { orkArchive } from '../../../src/services/files/saveOrk';
import { unpackOrk } from '../../../src/services/files/ork/importUnpack';
import { rseDigest } from '../../../src/services/files/ork/embeddedMotors';
import { unzipSync } from 'fflate';
import {
  PLUGGED_DELAY,
  type ComponentNode,
  type MotorSpec,
  type RocketTree,
} from '../../../src/engine/openRocketEngine';
const CATALOG = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/motors.generated.json'), 'utf8'),
) as CatalogMotor[];

const row = (manufacturer: string, designation: string) =>
  CATALOG.find((m) => m.manufacturer === manufacturer && m.designation === designation)!;
vi.mock('../../../src/services/motors/motorDb', async (original) => ({
  ...(await original<typeof import('../../../src/services/motors/motorDb')>()),
  loadCatalog: vi.fn(async () => CATALOG),
}));

describe('the motor catalog carries OpenRocket’s own digests', () => {
  it('keeps most of the catalog digested', () => {
    const digested = CATALOG.filter((m) => m.digests?.length).length;
    expect(digested).toBeGreaterThan(CATALOG.length * 0.85);
  });

  it('holds more than one entry for a motor whose name the desktop shares', () => {
    expect(row('Estes', 'C6').digests!.length).toBeGreaterThan(1);
  });

  it('every entry has a 32-character checksum and the delays it offers', () => {
    for (const m of CATALOG) {
      for (const e of m.digests ?? []) {
        expect(e.digest, `${m.manufacturer} ${m.designation}`).toMatch(/^[0-9a-f]{32}$/);
        expect(Array.isArray(e.delays)).toBe(true);
      }
    }
  });
});

describe('catalogDigest picks the entry the seated delay means', () => {
  const c6 = () => row('Estes', 'C6');

  it('picks the plugged entry for a plugged motor', () => {
    const plugged = c6().digests!.find((e) => e.delays.includes('P'))!;
    expect(catalogDigest(c6(), PLUGGED_DELAY)).toBe(plugged.digest);
  });

  it('picks the delayed entry for a delay that entry offers', () => {
    const delayed = c6().digests!.find((e) => e.delays.includes(5))!;
    expect(catalogDigest(c6(), 5)).toBe(delayed.digest);
    expect(catalogDigest(c6(), 5)).not.toBe(catalogDigest(c6(), PLUGGED_DELAY));
  });

  it('falls back to the closest curve when no entry offers that delay', () => {
    expect(catalogDigest(c6(), 2)).toBe(c6().digests![0]!.digest);
  });

  it('gives no digest for a motor the desktop’s database has no entry for', () => {
    expect(catalogDigest({ designation: 'X', manufacturer: 'Nobody' } as CatalogMotor, 5)).toBeUndefined();
  });
});

describe('a saved .ork names which motor it means', () => {
  const node = (o: object) => o as unknown as ComponentNode;
  const tree = {
    components: [
      node({
        type: 'stage',
        id: 's1',
        children: [node({ type: 'bodytube', id: 'body', length: 0.3, outerRadius: 0.013, motorMount: true })],
      }),
    ],
  } as unknown as RocketTree;
  const seated = (delay: number): MountMotor =>
    ({
      spec: {
        designation: 'C6',
        manufacturer: 'Estes',
        diameter: 0.018,
        length: 0.07,
        ejectionDelay: delay,
      } as unknown as MotorSpec,
    }) as MountMotor;

  const xmlFor = (motors: Record<string, OrkExportMotor>) =>
    exportOrk({ name: 'D', tree, configs: [{ id: 'cfg', name: null, motors }] });
  const exported = async (delay = 5) =>
    xmlFor(await fillMotorDigests(buildExportMotorMap(tree, newFlightConfig({ body: seated(delay) }))));
  it('writes no motor type for the desktop to filter by', async () => {
    expect(xmlFor(buildExportMotorMap(tree, newFlightConfig({ body: seated(5) })))).not.toContain('<type>');
  });

  it('writes the digest into the <motor> block, where the desktop reads it', async () => {
    const digest = catalogDigest(row('Estes', 'C6'), 5)!;
    const xml = await exported(5);
    expect(xml).toContain(`<digest>${digest}</digest>`);
    expect(xml).toMatch(
      /<manufacturer>Estes<\/manufacturer>\s*<digest>[0-9a-f]{32}<\/digest>\s*<designation>C6<\/designation>/,
    );
  });

  it('does not depend on the seated motor carrying one', async () => {
    expect(buildExportMotorMap(tree, newFlightConfig({ body: seated(5) })).body!.digest).toBeUndefined();
    expect(await exported(5)).toContain('<digest>');
  });

  it('writes the plugged entry for a plugged motor, not the delayed one', async () => {
    const plugged = catalogDigest(row('Estes', 'C6'), PLUGGED_DELAY)!;
    expect(await exported(PLUGGED_DELAY)).toContain(`<digest>${plugged}</digest>`);
    expect(await exported(5)).not.toContain(`<digest>${plugged}</digest>`);
  });

  it('writes no digest element at all for a motor the catalog does not have', async () => {
    const odd = {
      spec: { designation: 'ZZ9', manufacturer: 'Nobody', diameter: 0.018, length: 0.07, ejectionDelay: 5 },
    } as unknown as MountMotor;
    const motors = await fillMotorDigests(buildExportMotorMap(tree, newFlightConfig({ body: odd })));
    expect(xmlFor(motors)).not.toContain('<digest>');
  });

  it('reads a file’s own digest back, and writes it out again', async () => {
    const digest = catalogDigest(row('Estes', 'C6'), 5)!;
    const { mountId: _mountId, ...ref } = Object.values(importOrk(await exported(5)).motors)[0]!;
    expect(ref.digest).toBe(digest);
    expect(xmlFor({ body: ref })).toContain(`<digest>${digest}</digest>`);
  });
});

describe('a saved .ork carries the curve of a motor the catalog does not have', () => {
  const node = (o: object) => o as unknown as ComponentNode;
  const tree = {
    components: [
      node({
        type: 'stage',
        id: 's1',
        children: [node({ type: 'bodytube', id: 'body', length: 0.3, outerRadius: 0.013, motorMount: true })],
      }),
    ],
  } as unknown as RocketTree;
  const curve = {
    designation: 'ZZ9',
    manufacturer: 'Nobody',
    diameter: 0.018,
    length: 0.07,
    ejectionDelay: 5,
    times: [0, 0.2, 1.8],
    thrusts: [0, 14, 0],
    masses: [0.024, 0.021, 0.012],
    cgX: 0.035,
  } as MotorSpec;
  const config = (spec: MotorSpec) => newFlightConfig({ body: { spec } as MountMotor });
  const save = async (spec: MotorSpec) => {
    const motors = await fillMotorDigests(buildExportMotorMap(tree, config(spec)));
    const zip = unzipSync(orkArchive({ name: 'Mine', tree, configs: [{ id: 'c', name: null, motors }] }));
    return { motors, zip };
  };

  it('writes the curve where the desktop looks, named by its digest, and that digest in the motor', async () => {
    const { motors, zip } = await save(curve);
    const digest = motors.body!.digest!;
    const text = new TextDecoder().decode(zip[`thrustcurves/${digest}.rse`]!);
    expect(rseDigest(text)).toBe(digest);
    expect(new TextDecoder().decode(zip['rocket.ork']!)).toContain(`<digest>${digest}</digest>`);
  });

  it('writes a motor the catalog names outright as the catalog motor, curve or not', async () => {
    const { motors, zip } = await save({ ...curve, designation: 'C6', manufacturer: 'Estes' });
    expect(motors.body!.digest).toBe(catalogDigest(row('Estes', 'C6'), 5));
    expect(Object.keys(zip).filter((n) => n.startsWith('thrustcurves/'))).toEqual([]);
  });

  // findMotors ranks a digest match first (ThrustCurveMotorSetDatabase.java:42-76).
  it.each([
    ['under a maker the catalog does not carry', { designation: 'G80', manufacturer: 'Homemade', diameter: 0.029 }],
    ['under a shortened name', { designation: 'H128W-OLD', manufacturer: 'AeroTech', diameter: 0.029 }],
    ['with no maker, where several sell the name', { designation: 'C6', manufacturer: undefined }],
  ])('embeds the curve of a motor that shares a catalog name %s', async (_case, over) => {
    const stock = new Set(CATALOG.flatMap((m) => (m.digests ?? []).map((e) => e.digest)));
    const { motors, zip } = await save({ ...curve, ...over } as MotorSpec);
    const digest = motors.body!.digest!;
    expect(stock.has(digest)).toBe(false);
    expect(rseDigest(new TextDecoder().decode(zip[`thrustcurves/${digest}.rse`]!))).toBe(digest);
  });

  it('embeds the curve of a motor that shares a catalog name but not its diameter', async () => {
    const { motors, zip } = await save({ ...curve, designation: 'C6', manufacturer: 'Estes', diameter: 0.024 });
    const digest = motors.body!.digest!;
    expect(digest).not.toBe(catalogDigest(row('Estes', 'C6'), 5));
    expect(rseDigest(new TextDecoder().decode(zip[`thrustcurves/${digest}.rse`]!))).toBe(digest);
  });
  describe('with the motor also in the imported list', () => {
    const imported = (m: Partial<CatalogMotor>): CatalogMotor =>
      ({ designation: 'ZZ9', manufacturer: 'Nobody', diameter: 18, custom: true, ...m }) as CatalogMotor;

    it('still embeds the curve of a motor only the user has', async () => {
      vi.mocked(loadCatalog).mockResolvedValueOnce([imported({}), ...CATALOG]);
      const { motors, zip } = await save(curve);
      const digest = motors.body!.digest!;
      expect(digest).toBeDefined();
      expect(rseDigest(new TextDecoder().decode(zip[`thrustcurves/${digest}.rse`]!))).toBe(digest);
    });

    it('still writes the catalog digest for a motor the catalog names outright', async () => {
      vi.mocked(loadCatalog).mockResolvedValueOnce([
        imported({ designation: 'C6', manufacturer: 'Estes' }),
        ...CATALOG,
      ]);
      const { motors } = await save({ ...curve, designation: 'C6', manufacturer: 'Estes' });
      expect(motors.body!.digest).toBe(catalogDigest(row('Estes', 'C6'), 5));
    });
  });

  it('is found by our own importer under that digest', async () => {
    const motors = await fillMotorDigests(buildExportMotorMap(tree, config(curve)));
    const bytes = orkArchive({ name: 'Mine', tree, configs: [{ id: 'c', name: null, motors }] });
    const archive = unpackOrk(bytes.slice().buffer);
    expect(archive.motorFiles.map(rseDigest)).toEqual([motors.body!.digest]);
  });
});
