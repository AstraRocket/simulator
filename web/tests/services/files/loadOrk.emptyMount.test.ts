import { describe, it, expect, vi } from 'vitest';
import { hasThrustCurve } from '../../../src/services/flight/runnability';
import { noteTexts } from '../../testing/importNotes';
import { importNoteText } from '../../../src/services/files/importNote';
import i18n from '../../../src/i18n';
import es from '../../../src/i18n/locales/es.json';

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
    tree: {
      name: 'Empty',
      components: [
        {
          type: 'stage',
          id: 's',
          children: [
            { type: 'bodytube', id: 'body', length: 0.3, outerRadius: 0.012, motorMount: true, name: 'Body' },
            {
              type: 'innertube',
              id: 'pod',
              length: 0.07,
              outerRadius: 0.0095,
              motorMount: true,
              name: 'Pod mount',
              ignitionEvent: 'burnout',
              ignitionDelay: 1,
            },
          ],
        },
      ],
    },
    motors: {},
    notes: [],
    ignored: [],
  }),
}));

vi.mock('../../../src/services/motors/motorSpec', () => ({ catalogMotorSpec: vi.fn() }));
vi.mock('../../../src/services/motors/motorDb', () => ({
  loadCatalog: () => Promise.resolve([]),
  findCatalogMotor: () => undefined,
  matchCatalogMotor: () => undefined,
}));

const { loadOrk, emptyMountMotor } = await import('../../../src/services/files/loadOrk');

describe('loadOrk with mounts the file gave no motor', () => {
  it('seats a curve-less placeholder in every empty mount', async () => {
    const loaded = await loadOrk(new ArrayBuffer(0));
    expect(Object.keys(loaded.configs[0]!.motors).sort()).toEqual(['body', 'pod']);
    for (const m of Object.values(loaded.configs[0]!.motors)) {
      expect(hasThrustCurve(m.spec)).toBe(false);
      expect(m.spec.designation).toBe('');
    }
    expect(design.setMotorById).not.toHaveBeenCalled();
  });

  // Desktop gives a motor chosen for an empty slot the mount's own ignition (MotorConfigurationPanel.selectMotor).
  it("carries each mount's own ignition into its placeholder", async () => {
    const loaded = await loadOrk(new ArrayBuffer(0));
    expect(loaded.configs[0]!.motors['pod']).toMatchObject({ ignitionEvent: 'burnout', ignitionDelay: 1 });
    expect(loaded.configs[0]!.motors['body']!.ignitionEvent).toBeUndefined();
  });

  it('names the empty mounts in one note that says no default will fly', async () => {
    const loaded = await loadOrk(new ArrayBuffer(0));
    const note = noteTexts(loaded.notes).find((n) => /no motor in this file/i.test(n));
    expect(note).toBeDefined();
    expect(note).toMatch(/"Body"/);
    expect(note).toMatch(/"Pod mount"/);
    expect(note).toMatch(/No motor is substituted/);
  });

  it('joins the mount names in the language the note is read in', async () => {
    const loaded = await loadOrk(new ArrayBuffer(0));
    const note = loaded.notes.find((n) => typeof n === 'object' && n.key === 'importNote.mountsWithoutMotor')!;
    await i18n.changeLanguage('es');
    try {
      const list = new Intl.ListFormat('es', { type: 'conjunction' }).format(['"Body"', '"Pod mount"']);
      expect(importNoteText(note, i18n.t)).toBe(es.importNote.mountsWithoutMotor.replace('{{mounts}}', list));
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('the placeholder itself has no curve', () => {
    expect(hasThrustCurve(emptyMountMotor())).toBe(false);
  });
});
