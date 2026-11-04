import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  filterMotors,
  allClasses,
  allManufacturers,
  findCatalogMotor,
  matchCatalogMotor,
  hasCurve,
  loadCatalog,
  type CatalogMotor,
  type MotorFilter,
} from '../../../src/services/motors/motorDb';
import { fetchCatalog } from '../../../src/services/app/remoteData';
vi.mock('../../../src/services/app/remoteData', () => ({ fetchCatalog: vi.fn() }));
vi.mock('../../../src/services/motors/motorStore', () => ({
  getMotorStore: () => ({ listCustomMotors: async () => [] }),
}));

describe('hasCurve', () => {
  const m = (curves?: unknown): CatalogMotor =>
    ({
      designation: 'x',
      manufacturer: 'y',
      class: 'A',
      diameter: 18,
      impulse: 1,
      burn: 1,
      mass: 1,
      curves,
    }) as CatalogMotor;
  it('is true only for a bundled curve with ≥ 2 samples', () => {
    expect(
      hasCurve(
        m([
          {
            src: 'x',
            samples: [
              [0, 0],
              [1, 10],
            ],
          },
        ]),
      ),
    ).toBe(true);
    expect(hasCurve(m([{ src: 'x', samples: [[0, 0]] }]))).toBe(false);
    expect(hasCurve(m([]))).toBe(false);
    expect(hasCurve(m(undefined))).toBe(false);
  });
});

const catalog: CatalogMotor[] = [
  { designation: 'C6', manufacturer: 'Estes', class: 'C', diameter: 18, impulse: 8.8, burn: 1.7, mass: 24 },
  { designation: 'C6', manufacturer: 'Quest', class: 'C', diameter: 18, impulse: 9.0, burn: 1.9, mass: 25 },
  { designation: 'D12', manufacturer: 'Estes', class: 'D', diameter: 24, impulse: 16.8, burn: 1.6, mass: 43 },
  { designation: 'B6', manufacturer: 'Estes', class: 'B', diameter: 18, impulse: 4.3, burn: 0.8, mass: 18 },
];

const filter = (over: Partial<MotorFilter> = {}): MotorFilter => ({
  classes: new Set(),
  manufacturers: new Set(),
  text: '',
  ...over,
});

describe('filterMotors, by sparks and by full name', () => {
  const aero: CatalogMotor[] = [
    {
      designation: 'H128',
      code: 'H128W',
      manufacturer: 'AeroTech',
      class: 'H',
      diameter: 29,
      impulse: 220,
      burn: 1.8,
      mass: 200,
    },
    {
      designation: 'H125',
      code: 'H125SM',
      manufacturer: 'AeroTech',
      class: 'H',
      diameter: 29,
      impulse: 200,
      burn: 1.6,
      mass: 200,
      sparky: true,
    },
  ];
  const names = (over: Partial<MotorFilter>) => filterMotors(aero, filter(over)).map((m) => m.designation);

  it('finds a motor by its full designation, propellant letter and all', () => {
    expect(names({ text: 'h128w' })).toEqual(['H128']);
    expect(names({ text: 'SM' })).toEqual(['H125']);
  });

  it('keeps only sparky motors, none of them, or all', () => {
    expect(names({ sparky: 'only' })).toEqual(['H125']);
    expect(names({ sparky: 'none' })).toEqual(['H128']);
    expect(names({ sparky: 'any' })).toEqual(['H128', 'H125']);
  });
});

describe('filterMotors', () => {
  it('returns everything with no active facets', () => {
    expect(filterMotors(catalog, filter())).toHaveLength(4);
  });

  it('filters by impulse class', () => {
    expect(filterMotors(catalog, filter({ classes: new Set(['C']) }))).toHaveLength(2);
    expect(filterMotors(catalog, filter({ classes: new Set(['D']) }))).toHaveLength(1);
  });

  it('filters by manufacturer', () => {
    expect(filterMotors(catalog, filter({ manufacturers: new Set(['Estes']) }))).toHaveLength(3);
  });

  it('filters by case-insensitive designation substring', () => {
    expect(filterMotors(catalog, filter({ text: 'c6' }))).toHaveLength(2);
    expect(filterMotors(catalog, filter({ text: '  D1 ' }))).toHaveLength(1);
  });

  it('filters by a diameter range (mm), inclusive', () => {
    expect(filterMotors(catalog, filter({ maxDiameter: 18 })).map((m) => m.designation)).toEqual(['C6', 'C6', 'B6']);
    expect(filterMotors(catalog, filter({ maxDiameter: 24 }))).toHaveLength(4);
    expect(filterMotors(catalog, filter({ minDiameter: 24 })).map((m) => m.designation)).toEqual(['D12']);
    expect(filterMotors(catalog, filter({ minDiameter: 18, maxDiameter: 18 }))).toHaveLength(3);
    expect(filterMotors(catalog, filter({ minDiameter: 24, maxDiameter: 18 }))).toEqual([]);
  });

  it('filters by a total impulse range (N·s), inclusive', () => {
    expect(filterMotors(catalog, filter({ minImpulse: 9 })).map((m) => m.designation)).toEqual(['C6', 'D12']);
    expect(filterMotors(catalog, filter({ maxImpulse: 8.8 })).map((m) => m.designation)).toEqual(['C6', 'B6']);
    expect(filterMotors(catalog, filter({ minImpulse: 8.8, maxImpulse: 9 }))).toHaveLength(2);
    expect(filterMotors(catalog, filter({ minImpulse: 100 }))).toEqual([]);
  });

  it('filters by what goes in the mount, on both bore and length', () => {
    const row = (designation: string, diameter: number, length?: number): CatalogMotor => ({
      designation,
      manufacturer: 'Estes',
      class: 'C',
      diameter,
      impulse: 8.8,
      burn: 1.7,
      mass: 24,
      length,
    });
    const mounted = [row('fits', 18, 70), row('tooFat', 24, 70), row('tooLong', 18, 120), row('noLength', 18)];
    // An 18 mm tube 70 mm long, plus the default 6.35 mm of overhang.
    const kept = filterMotors(mounted, filter({ fit: { bore: 18, maxLength: 76.35 } }));
    expect(kept.map((m) => m.designation)).toEqual(['fits', 'noLength']);
  });

  it('filters to the motors sold without an ejection charge', () => {
    const row = (designation: string, delays?: string): CatalogMotor => ({
      designation,
      manufacturer: 'Estes',
      class: 'C',
      diameter: 18,
      impulse: 8.8,
      burn: 1.7,
      mass: 24,
      delays,
    });
    const rows = [row('pluggedOnly', 'P'), row('both', '0,3,5,P'), row('delayed', '4,6,8'), row('unknown')];
    const kept = filterMotors(rows, filter({ plugged: true }));
    expect(kept.map((m) => m.designation)).toEqual(['pluggedOnly', 'both']);
  });

  it('AND-s facets together', () => {
    const r = filterMotors(catalog, filter({ classes: new Set(['C']), manufacturers: new Set(['Quest']) }));
    expect(r).toHaveLength(1);
    expect(r[0]!.manufacturer).toBe('Quest');
  });
});

describe('facet lists', () => {
  it('allClasses is de-duped and sorted A→…', () => {
    expect(allClasses(catalog)).toEqual(['B', 'C', 'D']);
  });

  it('allManufacturers is de-duped and alphabetical', () => {
    expect(allManufacturers(catalog)).toEqual(['Estes', 'Quest']);
  });
});

describe('findCatalogMotor', () => {
  it('matches designation exactly (first candidate wins)', () => {
    expect(findCatalogMotor(catalog, 'C6')!.manufacturer).toBe('Estes');
  });

  it('prefers the requested manufacturer', () => {
    expect(findCatalogMotor(catalog, 'C6', 'Quest')!.manufacturer).toBe('Quest');
  });

  it('falls back to a loose match ignoring spaces/dashes', () => {
    expect(findCatalogMotor(catalog, 'C 6')!.designation).toBe('C6');
    expect(findCatalogMotor(catalog, 'd-12')!.designation).toBe('D12');
  });

  it('returns undefined for an empty designation or no match', () => {
    expect(findCatalogMotor(catalog, '')).toBeUndefined();
    expect(findCatalogMotor(catalog, 'X9')).toBeUndefined();
  });
});
describe('findCatalogMotor: a leading impulse number', () => {
  const cat: CatalogMotor[] = [
    {
      designation: 'J530',
      manufacturer: 'Cesaroni',
      class: 'J',
      diameter: 38,
      impulse: 1,
      burn: 1,
      mass: 1,
      code: '1115J530-15A',
    },
    { designation: '1/2A6', manufacturer: 'Estes', class: 'A', diameter: 13, impulse: 1, burn: 1, mass: 1 },
  ];

  it.each(['206J530-IM', '1115J530', '1115J530-15A', 'J530-IM', 'J530'])('resolves %s', (name) => {
    expect(findCatalogMotor(cat, name, 'Cesaroni')!.designation).toBe('J530');
  });

  it('leaves a designation that really starts with digits alone', () => {
    expect(findCatalogMotor(cat, '1/2A6', 'Estes')!.designation).toBe('1/2A6');
  });

  it('still matches nothing when the motor is not in the catalog', () => {
    expect(findCatalogMotor(cat, '206K530-IM', 'Cesaroni')).toBeUndefined();
  });
});
describe('findCatalogMotor: a name in several hyphenated parts', () => {
  const cat: CatalogMotor[] = [
    {
      designation: 'E31',
      manufacturer: 'Cesaroni',
      class: 'E',
      diameter: 24,
      impulse: 1,
      burn: 1,
      mass: 1,
      code: '26E31-15A',
    },
    {
      designation: 'H135',
      manufacturer: 'Cesaroni',
      class: 'H',
      diameter: 29,
      impulse: 1,
      burn: 1,
      mass: 1,
      code: '217H135-12A',
    },
    {
      designation: 'H135',
      manufacturer: 'AeroTech',
      class: 'H',
      diameter: 29,
      impulse: 1,
      burn: 1,
      mass: 1,
      code: 'HP-H135W',
    },
    { designation: '1/2A6', manufacturer: 'Estes', class: 'A', diameter: 13, impulse: 1, burn: 1, mass: 1 },
  ];

  it('reads past the impulse and the propellant alike', () => {
    expect(findCatalogMotor(cat, '26-E31-WH-15A', 'Cesaroni')!.designation).toBe('E31');
  });

  it('keeps letting the maker in the file break the tie', () => {
    expect(findCatalogMotor(cat, '217-H135-WH-12A', 'AeroTech')!.manufacturer).toBe('AeroTech');
    expect(findCatalogMotor(cat, '217-H135-WH-12A', 'Cesaroni')!.manufacturer).toBe('Cesaroni');
  });

  it('never wears a name down to a bare number', () => {
    expect(findCatalogMotor(cat, '26-ZZ9-WH-15A', 'Cesaroni')).toBeUndefined();
  });

  it('leaves a designation that really starts with digits alone', () => {
    expect(findCatalogMotor(cat, '1/2A6', 'Estes')!.designation).toBe('1/2A6');
  });
});

describe('findCatalogMotor: full .ork designations vs short catalog names', () => {
  const cat: CatalogMotor[] = [
    {
      designation: 'H128',
      manufacturer: 'AeroTech',
      class: 'H',
      diameter: 29,
      impulse: 1,
      burn: 1,
      mass: 1,
      code: 'H128W',
    },
    {
      designation: 'I180',
      manufacturer: 'AeroTech',
      class: 'I',
      diameter: 38,
      impulse: 1,
      burn: 1,
      mass: 1,
      code: 'I180W',
    },
    {
      designation: 'I180',
      manufacturer: 'Cesaroni',
      class: 'I',
      diameter: 38,
      impulse: 1,
      burn: 1,
      mass: 1,
      code: '338I180-14A',
    },
    {
      designation: 'J350',
      manufacturer: 'AeroTech',
      class: 'J',
      diameter: 38,
      impulse: 1,
      burn: 1,
      mass: 1,
      code: 'J350W',
    },
    {
      designation: 'J350',
      manufacturer: 'Loki',
      class: 'J',
      diameter: 38,
      impulse: 1,
      burn: 1,
      mass: 1,
      code: 'J350-SF',
    },
    {
      designation: 'G84',
      manufacturer: 'Cesaroni',
      class: 'G',
      diameter: 29,
      impulse: 1,
      burn: 1,
      mass: 1,
      code: '131G84-10A',
    },
  ];

  it('matches an AeroTech full name via the code field', () => {
    expect(findCatalogMotor(cat, 'H128W', 'AeroTech')!.designation).toBe('H128');
  });

  it('matches a Cesaroni full name (case + delay) via the code field', () => {
    const m = findCatalogMotor(cat, '131G84-10A', 'Cesaroni Technology')!;
    expect(m.designation).toBe('G84');
    expect(m.manufacturer).toBe('Cesaroni');
  });

  it('disambiguates duplicate short names by manufacturer', () => {
    expect(findCatalogMotor(cat, 'I180W', 'AeroTech')!.manufacturer).toBe('AeroTech');
    expect(findCatalogMotor(cat, '338I180-14A', 'Cesaroni')!.manufacturer).toBe('Cesaroni');
  });

  it('resolves a variant suffix by stripping it (J350W-OLD → J350 AeroTech)', () => {
    const m = findCatalogMotor(cat, 'J350W-OLD', 'AeroTech')!;
    expect(m.designation).toBe('J350');
    expect(m.manufacturer).toBe('AeroTech');
  });

  it('still returns undefined when the motor genuinely is not present', () => {
    expect(findCatalogMotor(cat, 'K1100T', 'AeroTech')).toBeUndefined();
  });
});
describe('loadCatalog with a malformed row', () => {
  const good = (designation: string): CatalogMotor => ({
    designation,
    manufacturer: 'Estes',
    class: 'C',
    diameter: 18,
    impulse: 8.8,
    burn: 1.7,
    mass: 24,
  });

  beforeEach(() => {
    vi.mocked(fetchCatalog).mockReset();
  });
  const serve = (body: unknown) =>
    vi
      .mocked(fetchCatalog)
      .mockImplementation((name, valid) =>
        valid && !valid(body)
          ? Promise.reject(new Error(`Could not load the ${name} catalog (unexpected catalog shape)`))
          : Promise.resolve(body as never),
      );

  it('drops the bad row and keeps the rest', async () => {
    serve([good('C6'), { designation: 42, manufacturer: 'x' }, null, good('D12')]);
    const rows = await loadCatalog();
    expect(rows.map((m) => m.designation)).toEqual(['C6', 'D12']);
  });

  it('drops a row whose optional fields are malformed', async () => {
    serve([
      good('C6'),
      { ...good('B4'), code: 4 },
      { ...good('D12'), curves: [{ src: 'x', samples: [[0, null]] }] },
      { ...good('E9'), cg: [[0, 'x']] },
      { ...good('F15'), digests: [{ digest: 'd', delays: 'P' }] },
      { ...good('G40'), digests: [{ digest: 'd', delays: [4, 'P'] }], cg: [[0, 0.1]], code: 'G40W' },
    ]);
    const rows = await loadCatalog();
    expect(rows.map((m) => m.designation)).toEqual(['C6', 'G40']);
  });

  it('still rejects a catalog that is not an array', async () => {
    serve({ error: 'rebuilding' });
    await expect(loadCatalog()).rejects.toThrow(/Could not load the motors catalog/);
  });

  it('still rejects a catalog with no usable row at all', async () => {
    serve([{ designation: 42 }, 'nope']);
    await expect(loadCatalog()).rejects.toThrow(/Could not load the motors catalog/);
  });
});
describe('matchCatalogMotor: how sure the match is', () => {
  const cat: CatalogMotor[] = [
    { designation: 'C6', manufacturer: 'Estes', class: 'C', diameter: 18, impulse: 1, burn: 1, mass: 1 },
    { designation: 'I170', manufacturer: 'Cesaroni', class: 'I', diameter: 38, impulse: 1, burn: 1, mass: 1 },
    { designation: 'I170', manufacturer: 'AeroTech', class: 'I', diameter: 54, impulse: 1, burn: 1, mass: 1 },
    {
      designation: 'E31',
      manufacturer: 'Cesaroni',
      class: 'E',
      diameter: 24,
      impulse: 1,
      burn: 1,
      mass: 1,
      code: '26E31-15A',
    },
  ];

  it('has no doubt when the name and the maker both say so', () => {
    expect(matchCatalogMotor(cat, 'C6', 'Estes')).toEqual({ motor: cat[0] });
  });

  it('reports the MAKER when the file named one we carry nothing for', () => {
    const m = matchCatalogMotor(cat, 'I170', 'Kosdon');
    expect(m!.motor.manufacturer).toBe('Cesaroni');
    expect(m!.doubt).toBe('maker');
  });

  it('reports SEVERAL when nothing separates two equally good matches', () => {
    const m = matchCatalogMotor(cat, 'I170');
    expect(m!.doubt).toBe('several');
  });

  it('reports SHORTENED when the name only matched once parts came off', () => {
    const m = matchCatalogMotor(cat, '26-E31-WH-15A', 'Cesaroni');
    expect(m!.motor.designation).toBe('E31');
    expect(m!.doubt).toBe('shortened');
  });

  it('puts the maker first, as the most surprising of the three', () => {
    expect(matchCatalogMotor(cat, '206-I170-WH-14A', 'Kosdon')!.doubt).toBe('maker');
  });

  it('finds nothing rather than doubting something', () => {
    expect(matchCatalogMotor(cat, 'ZZ9', 'Estes')).toBeUndefined();
  });

  it('is what findCatalogMotor returns, without the doubt', () => {
    expect(findCatalogMotor(cat, 'I170', 'Kosdon')).toBe(matchCatalogMotor(cat, 'I170', 'Kosdon')!.motor);
  });
});

describe('filterMotors, desktop filters', () => {
  const withOop: CatalogMotor[] = [...catalog, { ...catalog[0]!, designation: 'C5', oop: true }];

  it('hides motors out of regular production only when asked', () => {
    expect(filterMotors(withOop, filter())).toHaveLength(5);
    expect(filterMotors(withOop, filter({ hideOop: true })).map((m) => m.designation)).not.toContain('C5');
  });

  it('hides the motors named in `hide`, by their key', () => {
    const out = filterMotors(catalog, filter({ hide: new Set(['Estes|C6|18|']) }));
    expect(out.map((m) => `${m.manufacturer} ${m.designation}`)).toEqual(['Quest C6', 'Estes D12', 'Estes B6']);
  });
});
