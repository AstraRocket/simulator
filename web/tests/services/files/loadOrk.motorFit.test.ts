import { describe, it, expect, vi, beforeEach } from 'vitest';
import { noteTexts } from '../../testing/importNotes';

const design = {
  setMotorById: vi.fn(),
  setMotorIgnitionById: vi.fn(),
  staticInfo: vi.fn(() => ({ mass: 1, cgX: 0.5 })),
};

vi.mock('../../../src/engine/openRocketEngine', () => ({
  engineActive: () => true,
  OpenRocketDesign: { buildTree: () => design },
  resetEngine: () => {},
}));

const tree = {
  name: 'Fits',
  components: [
    {
      type: 'stage',
      id: 's1',
      children: [
        {
          type: 'bodytube',
          id: 'body',
          length: 0.5,
          outerRadius: 0.04,
          thickness: 0.001,
          children: [
            {
              type: 'innertube',
              id: 'mount1',
              name: 'Motor tube',
              motorMount: true,
              length: 0.3,
              outerRadius: 0.0195,
              thickness: 0.0005,
            },
          ],
        },
      ],
    },
  ],
};

vi.mock('../../../src/services/files/designFile', () => ({
  parseDesignFile: () => ({
    tree,
    motors: {
      mount1: {
        designation: 'J360SK',
        manufacturer: 'Cesaroni',
        delay: 0,
        diameter: 0.038,
        length: 0.3,
        ...(fileDigest.value ? { digest: fileDigest.value } : {}),
      },
    },
    notes: [],
    ignored: [],
  }),
}));

const catalogMotorSpec = vi.fn();
vi.mock('../../../src/services/motors/motorSpec', () => ({
  catalogMotorSpec: (...a: unknown[]) => catalogMotorSpec(...a),
}));

const doubt: { value: string | undefined } = { value: undefined };
const fileDigest: { value: string | undefined } = { value: undefined };
const row = { designation: 'J360', manufacturer: 'Cesaroni', diameter: 54, digests: [{ digest: 'cat-j360' }] };

vi.mock('../../../src/services/motors/motorDb', () => ({
  loadCatalog: () => Promise.resolve([]),
  matchCatalogMotor: () => ({ motor: row, ...(doubt.value ? { doubt: doubt.value } : {}) }),
}));

const { loadOrk } = await import('../../../src/services/files/loadOrk');

const spec = (diameter: number, length: number) => ({
  designation: 'J360',
  manufacturer: 'Cesaroni',
  diameter,
  length,
  times: [0, 1, 3],
  thrusts: [0, 600, 0],
  masses: [1.2, 0.9, 0.5],
  cgX: 0.205,
  ejectionDelay: 0,
});

describe('a motor the file names for a mount it does not go in', () => {
  beforeEach(() => {
    catalogMotorSpec.mockReset();
    design.setMotorById.mockReset();
    doubt.value = undefined;
  });

  it('seats it anyway, as the file asks', async () => {
    catalogMotorSpec.mockResolvedValue(spec(0.054, 0.3));
    const loaded = await loadOrk(new ArrayBuffer(0));
    expect(loaded.configs[0]!.motors['mount1']!.spec.designation).toBe('J360');
    expect(design.setMotorById).toHaveBeenCalled();
  });

  it('says it does not fit, naming both diameters', async () => {
    catalogMotorSpec.mockResolvedValue(spec(0.054, 0.3));
    const notes = noteTexts((await loadOrk(new ArrayBuffer(0))).notes).join(' ');
    expect(notes).toMatch(/54 mm/);
    expect(notes).toMatch(/38 mm/);
    expect(notes).toMatch(/Motor tube/);
    expect(notes).toMatch(/does not fit/i);
  });

  it('says nothing about a motor that fits', async () => {
    catalogMotorSpec.mockResolvedValue(spec(0.038, 0.3));
    const notes = noteTexts((await loadOrk(new ArrayBuffer(0))).notes).join(' ');
    expect(notes).not.toMatch(/does not fit/i);
  });

  it('judges the length too, against the tube plus its overhang', async () => {
    catalogMotorSpec.mockResolvedValue(spec(0.038, 1.0));
    const notes = noteTexts((await loadOrk(new ArrayBuffer(0))).notes).join(' ');
    expect(notes).toMatch(/1000 mm long/);
    expect(notes).toMatch(/300 mm/);
  });

  it('complains once per mount and motor, not once per configuration', async () => {
    catalogMotorSpec.mockResolvedValue(spec(0.054, 0.3));
    const loaded = await loadOrk(new ArrayBuffer(0));
    expect(noteTexts(loaded.notes).filter((n) => /does not fit/i.test(n))).toHaveLength(1);
  });
});

// Desktop treats the file's maker as a filter and leaves the mount empty unless the digest matches.
describe('a motor the file did not confirm', () => {
  beforeEach(() => {
    catalogMotorSpec.mockReset();
    catalogMotorSpec.mockResolvedValue(spec(0.038, 0.3));
    doubt.value = undefined;
  });

  it("leaves the mount for the user when the catalog has only another maker's motor", async () => {
    doubt.value = 'maker';
    fileDigest.value = undefined;
    const loaded = await loadOrk(new ArrayBuffer(0));
    expect(catalogMotorSpec).not.toHaveBeenCalled();
    const seated = loaded.configs[0]!.motors['mount1']!.spec;
    expect(seated.times).toHaveLength(0);
    const notes = noteTexts(loaded.notes).join(' ');
    expect(notes).toMatch(/filed under Cesaroni/);
    expect(notes).toMatch(/pick a motor for that mount/i);
  });

  it("loads another maker's motor when the file's digest names it", async () => {
    doubt.value = 'maker';
    fileDigest.value = 'cat-j360';
    const loaded = await loadOrk(new ArrayBuffer(0));
    expect(catalogMotorSpec).toHaveBeenCalled();
    expect(loaded.configs[0]!.motors['mount1']!.spec.designation).toBe('J360');
    fileDigest.value = undefined;
  });

  it('says the name was not one the catalog carries', async () => {
    doubt.value = 'shortened';
    expect(noteTexts((await loadOrk(new ArrayBuffer(0))).notes).join(' ')).toMatch(/closest/i);
  });

  it('says when more than one motor matched', async () => {
    doubt.value = 'several';
    expect(noteTexts((await loadOrk(new ArrayBuffer(0))).notes).join(' ')).toMatch(/more than one/i);
  });

  it('says nothing when the file named the motor outright', async () => {
    const notes = noteTexts((await loadOrk(new ArrayBuffer(0))).notes).join(' ');
    expect(notes).not.toMatch(/check it before flying/i);
  });
});
