// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MotorSpec } from '../../../src/engine/openRocketEngine';
import { noteTexts } from '../../testing/importNotes';

// jsdom, because the `.rse` reader parses XML.

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

const RSE = `<engine-database><engine-list>
 <engine code="J350" mfg="AeroTech" Type="single-use" dia="38." len="326."
         initWt="878." propWt="496." Itot="712.9" avgThrust="350." peakThrust="480."
         burn-time="2.04" delays="6,10,14" massFrac="56." exitDia="0." Isp="146.">
  <data>
   <eng-data t="0." f="0." m="496." cg="163."/>
   <eng-data t="0.1" f="420." m="470." cg="163."/>
   <eng-data t="1.0" f="380." m="250." cg="163."/>
   <eng-data t="2.04" f="0." m="0." cg="163."/>
  </data>
 </engine>
</engine-list></engine-database>`;

const embedded = { value: [RSE] as string[] | undefined };

vi.mock('../../../src/services/files/designFile', () => ({
  parseDesignFile: () => ({
    tree: { name: 'Big', components: [] },
    // A `.ork` designation carries the delay; the embedded curve is named without it.
    motors: { mount1: { designation: 'J350-6', manufacturer: 'AeroTech', delay: 6, diameter: 0.038, length: 0.326 } },
    notes: [],
    ignored: [],
    embeddedMotors: embedded.value,
  }),
}));

const catalogMotorSpec = vi.fn();
const customMotorToSpec = vi.fn();
vi.mock('../../../src/services/motors/motorSpec', () => ({
  catalogMotorSpec: (...a: unknown[]) => catalogMotorSpec(...a),
  customMotorToSpec: (...a: unknown[]) => customMotorToSpec(...a),
}));

const catalogHit = { value: false };
vi.mock('../../../src/services/motors/motorDb', () => ({
  loadCatalog: () => Promise.resolve([]),
  findCatalogMotor: () => (catalogHit.value ? { designation: 'J350', manufacturer: 'AeroTech', diameter: 38 } : null),
  matchCatalogMotor: () =>
    catalogHit.value ? { motor: { designation: 'J350', manufacturer: 'AeroTech', diameter: 38 } } : undefined,
}));

const { loadOrk } = await import('../../../src/services/files/loadOrk');

// A full curve: seating a curve-less spec throws "Too short thrust-curve".
const SPEC = {
  designation: 'J350',
  diameter: 0.038,
  length: 0.25,
  cgX: 0.125,
  times: [0, 1, 2, 3],
  thrusts: [0, 420, 380, 0],
  masses: [0.6, 0.5, 0.4, 0.3],
} as unknown as MotorSpec;

beforeEach(() => {
  vi.clearAllMocks();
  embedded.value = [RSE];
  catalogHit.value = false;
  customMotorToSpec.mockReturnValue(SPEC);
});

describe('a motor the catalog does not have', () => {
  it('flies the curve the file brought, rather than nothing', async () => {
    const res = await loadOrk(new ArrayBuffer(0));
    expect(customMotorToSpec).toHaveBeenCalledTimes(1);
    expect(res.configs[0]!.motors['mount1']!.spec).toBe(SPEC);
    expect(design.setMotorById).toHaveBeenCalledWith('mount1', SPEC);
  });

  it('matches the curve by designation WITHOUT the delay', async () => {
    await loadOrk(new ArrayBuffer(0));
    const motor = customMotorToSpec.mock.calls[0]![0] as { designation: string };
    expect(motor.designation).toContain('J350');
    expect(customMotorToSpec.mock.calls[0]![1]).toBe(6);
  });

  it('says in the notes that the file supplied the curve', async () => {
    const res = await loadOrk(new ArrayBuffer(0));
    expect(noteTexts(res.notes).join('\n')).toMatch(/the thrust curve stored in the file is used/i);
  });

  it('still refuses to fly a default when the file carried no curve', async () => {
    embedded.value = undefined;
    const res = await loadOrk(new ArrayBuffer(0));
    expect(customMotorToSpec).not.toHaveBeenCalled();
    expect(res.configs[0]!.motors['mount1']!.spec.thrusts).toEqual([]);
    expect(noteTexts(res.notes).join('\n')).toMatch(/pick a motor for that mount/i);
  });
});

describe('a motor the catalog lists with no thrust curve', () => {
  beforeEach(() => {
    catalogHit.value = true;
    catalogMotorSpec.mockRejectedValue(new Error('no curve'));
  });

  it('falls back to the file’s own curve rather than a placeholder', async () => {
    const res = await loadOrk(new ArrayBuffer(0));
    expect(res.configs[0]!.motors['mount1']!.spec).toBe(SPEC);
    expect(noteTexts(res.notes).join('\n')).toMatch(/no thrust curve in the catalog/i);
  });

  it('keeps the placeholder when there is no embedded curve to fall back to', async () => {
    embedded.value = undefined;
    const res = await loadOrk(new ArrayBuffer(0));
    expect(res.configs[0]!.motors['mount1']!.spec.thrusts).toEqual([]);
  });

  it('prefers the catalog when it has the curve, so nothing changes for a normal design', async () => {
    catalogMotorSpec.mockResolvedValue(SPEC);
    await loadOrk(new ArrayBuffer(0));
    expect(catalogMotorSpec).toHaveBeenCalledTimes(1);
    expect(customMotorToSpec).not.toHaveBeenCalled();
  });
});
