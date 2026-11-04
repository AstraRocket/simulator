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

// Mocks the dispatcher, not `./orkFile`, because loadOrk reads both `.ork` and `.rkt`.
vi.mock('../../../src/services/files/designFile', () => ({
  parseDesignFile: () => ({
    tree: { name: 'Big', components: [] },
    motors: { mount1: { designation: 'K550', manufacturer: 'AeroTech', delay: 0, diameter: 0.054, length: 0.41 } },
    notes: [],
    ignored: [],
  }),
}));

const catalogMotorSpec = vi.fn();
vi.mock('../../../src/services/motors/motorSpec', () => ({
  catalogMotorSpec: (...a: unknown[]) => catalogMotorSpec(...a),
}));

vi.mock('../../../src/services/motors/motorDb', () => ({
  loadCatalog: () => Promise.resolve([]),
  findCatalogMotor: () => ({ designation: 'K550', manufacturer: 'AeroTech', diameter: 54 }),
  matchCatalogMotor: () => ({ motor: { designation: 'K550', manufacturer: 'AeroTech', diameter: 54 } }),
}));

const { loadOrk } = await import('../../../src/services/files/loadOrk');

describe('loadOrk when the thrust-curve download fails', () => {
  beforeEach(() => {
    catalogMotorSpec.mockReset();
    design.setMotorById.mockReset();
  });

  it('seats the unresolved motor rather than leaving the mount for a default C6', async () => {
    catalogMotorSpec.mockRejectedValue(new Error('network down'));
    const loaded = await loadOrk(new ArrayBuffer(0));

    const seated = loaded.configs[0]!.motors['mount1'];
    expect(seated).toBeDefined();
    expect(seated!.spec.designation).toBe('K550');
    expect(seated!.spec.times).toEqual([]);
    expect(seated!.spec.thrusts).toEqual([]);
  });

  it('says so in the import notes, naming the mount as unflyable', async () => {
    catalogMotorSpec.mockRejectedValue(new Error('network down'));
    const loaded = await loadOrk(new ArrayBuffer(0));
    expect(noteTexts(loaded.notes).join(' ')).toMatch(/K550/);
    expect(noteTexts(loaded.notes).join(' ')).toMatch(/No motor is substituted/i);
  });

  it('still seats the real motor when the download succeeds', async () => {
    catalogMotorSpec.mockResolvedValue({
      designation: 'K550',
      manufacturer: 'AeroTech',
      diameter: 0.054,
      length: 0.41,
      times: [0, 1, 3],
      thrusts: [0, 600, 0],
      masses: [1.2, 0.9, 0.5],
      cgX: 0.205,
      ejectionDelay: 0,
    });
    const loaded = await loadOrk(new ArrayBuffer(0));
    expect(loaded.configs[0]!.motors['mount1']!.spec.times).toHaveLength(3);
    expect(design.setMotorById).toHaveBeenCalled();
  });
});
