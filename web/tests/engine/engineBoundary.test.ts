import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  __setEngineForTests,
  OpenRocketDesign,
  standardPressurePa,
  type MotorSpec,
  type RocketTree,
} from '../../src/engine/openRocketEngine';
import { outlineCrossesItself } from '../../src/services/design/finOutline';
import { KERNEL_TEST_TIMEOUT_MS } from '../testing/kernelTimeout';
import {
  MAX_AUTO_RADIUS_RUN,
  MAX_COMPONENTS,
  MAX_FIN_POINTS,
  MAX_LINE_COUNT,
  MAX_NESTING_DEPTH,
  MAX_TOTAL_INSTANCES,
} from '../../src/services/files/ork/importLimits';

// The vendored module loads directly because `initEngine` wants a browser.
vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

type Engine = typeof import('../../src/engine/vendor/openrocket-engine.mjs');
let engine: Engine;

const TREE = {
  components: [
    {
      id: 'stage1',
      type: 'stage',
      children: [
        { id: 'nose', type: 'nosecone', length: 0.1, aftRadius: 0.013, thickness: 0.001, shape: 'ogive' },
        {
          id: 'tube',
          type: 'bodytube',
          length: 0.2,
          outerRadius: 0.013,
          thickness: 0.0005,
          motorMount: true,
          children: [
            {
              id: 'fins',
              type: 'trapezoidfinset',
              finCount: 3,
              rootChord: 0.06,
              tipChord: 0.03,
              sweep: 0.03,
              height: 0.05,
              thickness: 0.003,
            },
          ],
        },
      ],
    },
  ],
} as unknown as RocketTree;

const C6 = {
  designation: 'C6',
  diameter: 0.018,
  length: 0.07,
  cgX: 0.035,
  ejectionDelay: 5,
  times: [0, 0.5, 1.0, 1.5, 1.86],
  thrusts: [0, 12, 5, 4.5, 0],
  masses: [0.0242, 0.021, 0.017, 0.013, 0.0108],
} as unknown as MotorSpec;

beforeAll(async () => {
  engine = await import('../../src/engine/vendor/openrocket-engine.mjs');
  __setEngineForTests(engine);
});

const build = () => OpenRocketDesign.buildTree(TREE);

describe('the kernel is actually wired up', () => {
  it('builds a rocket and reports plausible static info', () => {
    const info = build().staticInfo();
    expect(info.length).toBeCloseTo(0.3, 6);
    expect(info.cg).toBeGreaterThan(0);
    expect(info.cp).toBeGreaterThan(0);
  });
});

// Desktop `PercentageOfLengthUnit` divides by `getLengthAerodynamic()`, not the full length.
const OVERHANG = {
  components: [
    {
      id: 'stage1',
      type: 'stage',
      children: [
        { id: 'nose', type: 'nosecone', length: 0.1, aftRadius: 0.013, thickness: 0.001, shape: 'ogive' },
        {
          id: 'tube',
          type: 'bodytube',
          length: 0.2,
          outerRadius: 0.013,
          thickness: 0.0005,
          children: [
            {
              id: 'fins',
              type: 'trapezoidfinset',
              finCount: 3,
              rootChord: 0.06,
              tipChord: 0.03,
              sweep: 0.03,
              height: 0.05,
              thickness: 0.003,
              position: { method: 'bottom', offset: 0 },
            },
            {
              id: 'mount',
              type: 'innertube',
              length: 0.07,
              outerRadius: 0.0095,
              thickness: 0.0005,
              motorMount: true,
              position: { method: 'bottom', offset: 0.04 },
            },
          ],
        },
      ],
    },
  ],
} as unknown as RocketTree;

describe('the stability margin comes from the kernel, in both units', () => {
  it('reports an aerodynamic span shorter than the rocket, for this design', () => {
    const info = OpenRocketDesign.buildTree(OVERHANG).staticInfo();
    expect(info.length).toBeCloseTo(0.34, 6);
    expect(info.lengthAerodynamic).toBeCloseTo(0.3, 6);
    expect(info.lengthAerodynamic).toBeLessThan(info.length);
  });

  it('measures the percentage against the AERODYNAMIC span', () => {
    const info = OpenRocketDesign.buildTree(OVERHANG).staticInfo();
    const margin = info.cp - info.cg;
    expect(info.stabilityPercent).toBeCloseTo((margin / info.lengthAerodynamic) * 100, 6);
  });

  it('is NOT the margin over the whole length, which overhang inflates', () => {
    const info = OpenRocketDesign.buildTree(OVERHANG).staticInfo();
    const wrong = ((info.cp - info.cg) / info.length) * 100;
    expect(Math.abs(info.stabilityPercent - wrong)).toBeGreaterThan(0.5);
  });

  it('measures calibers against the largest body diameter', () => {
    const info = OpenRocketDesign.buildTree(OVERHANG).staticInfo();
    expect(info.stabilityCalibers).toBeCloseTo((info.cp - info.cg) / info.refDiameter, 6);
    expect(info.refDiameter).toBeCloseTo(0.026, 6);
  });

  it('agrees with itself: the two units are the same margin', () => {
    const info = OpenRocketDesign.buildTree(OVERHANG).staticInfo();
    const fromCal = info.stabilityCalibers * info.refDiameter;
    const fromPct = (info.stabilityPercent / 100) * info.lengthAerodynamic;
    expect(fromCal).toBeCloseTo(fromPct, 9);
    expect(fromCal).toBeCloseTo(info.cp - info.cg, 9);
  });
});

describe('error envelopes, from the Java side', () => {
  it('a design held across a reset fails loudly instead of aliasing the next rocket', () => {
    const stale = build();
    expect(stale.staticInfo().length).toBeCloseTo(0.3, 6);

    engine.reset();
    const fresh = build();
    expect(fresh.staticInfo().length).toBeCloseTo(0.3, 6);

    expect(() => stale.staticInfo()).toThrow(/handle/i);
  });

  it('reports an unknown component id as a message, not an opaque throw', () => {
    expect(() => build().componentInfo('no-such-component')).toThrow(/no-such-component|not found|unknown/i);
  });

  it('refuses an unbounded aero sweep instead of exhausting the heap', () => {
    expect(() => build().aeroSweep({ machMin: 0, machMax: 1e9, machStep: 0.05 })).toThrow(/over the/);
    expect(() => build().aeroSweep({ machMin: 2, machMax: 1 })).toThrow(/finite machMin <= machMax/);
    // Infinity never reaches the kernel: JSON.stringify writes it as null.
    expect(JSON.stringify({ machMax: Infinity })).toBe('{"machMax":null}');
  });

  it('refuses a sweep whose point count overflows, instead of returning an empty one', () => {
    // Not /sweep/i: the wrapper names the call ("failed at aeroSweep").
    expect(() => build().aeroSweep({ machMin: 0, machMax: 1, machStep: 5e-324 })).toThrow(/infinite number|over the/);
    expect(() => build().aeroSweep({ machMin: -1.7e308, machMax: 1.7e308, machStep: 0.05 })).toThrow(
      /infinite number|over the/,
    );
  });

  it('the kernel itself refuses a non-finite ignition delay, not only the wrapper', () => {
    // Straight at the facade, or the wrapper's delayS check fires first.
    const h = engine.buildRocket(JSON.stringify(TREE));
    engine.setMotorById(h, 'tube', C6.designation, C6.diameter, C6.length, C6.times, C6.thrusts, C6.masses, C6.cgX, 5);
    for (const bad of [Infinity, -Infinity, NaN]) {
      expect(() => engine.setMotorIgnitionById(h, 'tube', 'launch', bad)).toThrow(/ignitionDelay|finite/);
    }
    expect(() => engine.setMotorIgnitionById(h, 'tube', 'launch', 1)).not.toThrow();
  });

  it('refuses a wind level that cannot say where it is', () => {
    const fly = (windLevels: unknown[]) => {
      const d = build();
      d.setMotorById('tube', C6);
      return () => d.simulate({ launchRodLength: 1, randomSeed: 7, windLevels } as never);
    };
    const level = (o: Record<string, unknown>) => ({ speed: 4, direction: Math.PI / 2, stddev: 0, ...o });

    expect(fly([level({})])).toThrow(/altitude/i);
    // JSON.stringify writes NaN and Infinity as null; the bridge default is NaN, not 0.
    expect(fly([level({ altitude: NaN })])).toThrow(/altitude/i);
    expect(fly([level({ altitude: Infinity })])).toThrow(/altitude/i);
    expect(fly([level({ altitude: 'high' })])).toThrow(/altitude/i);
  });

  it('refuses two wind levels at one altitude, naming the row', () => {
    const d = build();
    d.setMotorById('tube', C6);
    const level = (altitude: number, speed: number) => ({ altitude, speed, direction: Math.PI / 2, stddev: 0 });
    expect(() =>
      d.simulate({ launchRodLength: 1, randomSeed: 7, windLevels: [level(0, 4), level(0, 9)] } as never),
    ).toThrow(/repeat|level 2/i);
  });

  // Upstream's 4-arg `addWindLevel` seeds from `new Random()`, so the bridge seeds each level.
  it('gives one turbulent profile the same flight twice at one seed', () => {
    const fly = (randomSeed: number) => {
      const d = build();
      d.setMotorById('tube', C6);
      return d.simulate({
        launchRodLength: 1,
        randomSeed,
        windLevels: [
          { altitude: 0, speed: 6, direction: Math.PI / 2, stddev: 2 },
          { altitude: 600, speed: 14, direction: Math.PI / 2, stddev: 4 },
        ],
      } as never).summary.maxAltitude;
    };

    const first = fly(7);
    expect(first).toBeGreaterThan(0);
    expect(fly(7)).toBe(first);
    expect(fly(8)).not.toBe(first);
  });

  it('still flies a profile with one level per altitude', () => {
    const d = build();
    d.setMotorById('tube', C6);
    const level = (altitude: number, speed: number) => ({ altitude, speed, direction: Math.PI / 2, stddev: 0 });
    const out = d.simulate({
      launchRodLength: 1,
      randomSeed: 7,
      windLevels: [level(0, 2), level(600, 9)],
    } as never);
    expect(out.summary.maxAltitude).toBeGreaterThan(0);
  });

  it('still runs a sane sweep', () => {
    const sweep = build().aeroSweep({ machMin: 0.1, machMax: 0.3, machStep: 0.1 });
    expect(sweep.machs.length).toBeGreaterThan(1);
    expect(sweep.machs.every((m) => Number.isFinite(m))).toBe(true);
  });
});

describe('the boundary refuses what it cannot build faithfully', () => {
  const withPart = (id: string, patch: Record<string, unknown>) => {
    const tree = structuredClone(TREE) as unknown as { components: Record<string, unknown>[] };
    const visit = (nodes: Record<string, unknown>[]) => {
      for (const n of nodes) {
        const kids = n['children'];
        if (Array.isArray(kids)) visit(kids as Record<string, unknown>[]);
        if (n['id'] === id) Object.assign(n, patch);
      }
    };
    visit(tree.components);
    return tree as unknown as RocketTree;
  };

  it('refuses a trapezoid fin count the kernel would quietly clamp or truncate', () => {
    // FinSet.setFinCount clamps to 8, and an (int) cast truncates 3.9 to 3.
    for (const finCount of [12, 3.9, 0]) {
      expect(() => OpenRocketDesign.buildTree(withPart('fins', { finCount })).staticInfo()).toThrow(/finCount.*1\.\.8/);
    }
    expect(OpenRocketDesign.buildTree(withPart('fins', { finCount: 8 })).staticInfo().mass).toBeGreaterThan(0);
  });

  it('refuses a dimension past any real part, instead of reporting an all-null design', () => {
    expect(() => OpenRocketDesign.buildTree(withPart('nose', { length: 1e300 })).staticInfo()).toThrow(
      /length.*out of range/,
    );
  });

  it('refuses a children key that is not a list of parts, instead of dropping the subtree', () => {
    expect(() => OpenRocketDesign.buildTree(withPart('tube', { children: [1, 2, 3] })).staticInfo()).toThrow(
      /children.*object/,
    );
    expect(() =>
      OpenRocketDesign.buildTree(withPart('tube', { children: { type: 'trapezoidfinset' } })).staticInfo(),
    ).toThrow(/children.*list/);
  });
});

describe('every enum name is read, and an unknown one is refused', () => {
  const patched = (id: string, patch: Record<string, unknown>) => {
    const tree = structuredClone(TREE) as unknown as { components: Record<string, unknown>[] };
    const visit = (nodes: Record<string, unknown>[]) => {
      for (const n of nodes) {
        const kids = n['children'];
        if (Array.isArray(kids)) visit(kids as Record<string, unknown>[]);
        if (n['id'] === id) Object.assign(n, patch);
      }
    };
    visit(tree.components);
    return tree as unknown as RocketTree;
  };
  const builds = (id: string, patch: Record<string, unknown>) =>
    OpenRocketDesign.buildTree(patched(id, patch)).staticInfo();

  it('refuses a name it does not know, instead of defaulting it', () => {
    expect(() => builds('fins', { crossSection: 'diamond' })).toThrow(/fin cross-section: 'diamond'/);
    expect(() => builds('nose', { shape: 'bogus' })).toThrow(/shape: 'bogus'/);
    expect(() => builds('fins', { position: { method: 'nonsense', offset: 0 } })).toThrow(/position method/);
    expect(() => builds('nose', { finish: 'glossy' })).toThrow(/surface finish/);
  });

  it('reads the upstream names a desktop file can carry', () => {
    const cd = (finish: string) =>
      OpenRocketDesign.buildTree(patched('nose', { finish })).aeroSweep({ machMin: 0.3, machMax: 0.3, machStep: 0.1 })
        .powerOff.total[0]!;
    expect(cd('mirror')).toBeLessThan(cd('normal'));
    expect(builds('nose', { finish: 'optimum' }).mass).toBeGreaterThan(0);
    expect(builds('fins', { position: { method: 'after', offset: 0 } }).mass).toBeGreaterThan(0);
  });
});

describe('the builders check what they are given', () => {
  it('refuses a missing shape, a non-finite or negative size, and a fin count past 8', () => {
    const rocket = engine.newRocket();
    expect(() => engine.addNoseCone(rocket, 0.1, 0.013, 0.001, null as unknown as string, 0)).toThrow(/shape/);
    expect(() => engine.addNoseCone(rocket, Number.NaN, 0.013, 0.001, 'ogive', 0)).toThrow(/length/);
    expect(() => engine.addBodyTube(rocket, 0.3, -0.013, 0.0005, 0)).toThrow(/outerRadius/);
    const tube = engine.addBodyTube(rocket, 0.3, 0.013, 0.0005, 0);
    expect(() => engine.addTrapezoidFins(tube, 1e9, 0.06, 0.03, 0.03, 0.05, 0.003, 0)).toThrow(/finCount/);
    expect(() => engine.getWorstThetaDeg(rocket, Number.NaN, 0)).toThrow(/mach/);
  });
});

describe('the import ceilings match the kernel', () => {
  const deep = (levels: number) => {
    let node: Record<string, unknown> = {
      type: 'freeformfinset',
      finCount: 3,
      thickness: 0.002,
      points: [
        [0, 0],
        [0.02, 0.02],
        [0.03, 0],
      ],
    };
    for (let i = levels - 2; i >= 1; i--) {
      node =
        i % 2 === 1
          ? { type: 'bodytube', length: 0.1, outerRadius: 0.02, thickness: 0.001, children: [node] }
          : { type: 'podset', instanceCount: 1, children: [node] };
    }
    return { components: [{ type: 'stage', children: [node] }] } as unknown as RocketTree;
  };

  // Only the nesting refusal counts: this chain can fail for other reasons.
  it('admits the deepest design the importer admits, and refuses one level more', () => {
    expect(() => OpenRocketDesign.buildTree(deep(MAX_NESTING_DEPTH + 1)).staticInfo()).not.toThrow(/nesting/);
    expect(() => OpenRocketDesign.buildTree(deep(MAX_NESTING_DEPTH + 2)).staticInfo()).toThrow(/nesting/);
  });

  it('refuses a freeform outline past the browser ceiling', () => {
    const tree = structuredClone(TREE) as unknown as { components: Record<string, unknown>[] };
    const tube = (tree.components[0]!['children'] as Record<string, unknown>[])[1]!;
    const points = Array.from({ length: MAX_FIN_POINTS + 1 }, (_, i) => [i * 1e-5, i === 0 ? 0 : 0.01]);
    tube['children'] = [{ id: 'ff', type: 'freeformfinset', finCount: 3, thickness: 0.002, points }];
    expect(() => OpenRocketDesign.buildTree(tree as unknown as RocketTree).staticInfo()).toThrow(/points/);
  });

  it('refuses a freeform point past the size limit every other number has', () => {
    // The kernel snaps only past +2.5 m; a far negative point reached the area sums unchecked.
    const tree = structuredClone(TREE) as unknown as { components: Record<string, unknown>[] };
    const tube = (tree.components[0]!['children'] as Record<string, unknown>[])[1]!;
    const fin = (y: number) => ({
      id: 'ff',
      type: 'freeformfinset',
      finCount: 3,
      thickness: 0.002,
      points: [
        [0, 0],
        [0.02, y],
        [0.03, 0],
      ],
    });
    tube['children'] = [fin(-1e300)];
    expect(() => OpenRocketDesign.buildTree(tree as unknown as RocketTree).staticInfo()).toThrow(/point 1.*range/);
    tube['children'] = [fin(0.02)];
    expect(() => OpenRocketDesign.buildTree(tree as unknown as RocketTree).staticInfo()).not.toThrow();
  });

  it('refuses nested counts that multiply out past the browser ceiling, before building', () => {
    const tube = (children?: unknown[]) => ({
      type: 'bodytube',
      length: 0.1,
      outerRadius: 0.01,
      thickness: 0.001,
      children,
    });
    // A pod set sits on a tube, so each level is a tube carrying 64 pods.
    const pods = (levels: number) => {
      let node: Record<string, unknown> = tube();
      for (let i = 0; i < levels; i++) node = tube([{ type: 'podset', instanceCount: 64, children: [node] }]);
      return { components: [{ type: 'stage', children: [node] }] } as unknown as RocketTree;
    };
    // 1 + 64 + 64 + 4096 + 4096 instances.
    expect(() => OpenRocketDesign.buildTree(pods(2)).staticInfo()).not.toThrow();
    // 262,144 instances: refused at once, where building took seconds.
    const started = performance.now();
    expect(() => OpenRocketDesign.buildTree(pods(3))).toThrow(new RegExp(`more than ${MAX_TOTAL_INSTANCES} parts`));
    expect(performance.now() - started).toBeLessThan(1000);
  });

  // Every pass walks the chain back to its sized tube; 200 tubes took 24 s at one pass per tube.
  const tubes = (count: number, auto: (i: number) => boolean) =>
    ({
      components: [
        {
          type: 'stage',
          children: Array.from({ length: count }, (_, i) => ({
            type: 'bodytube',
            length: 0.01,
            outerRadius: 0.02,
            thickness: 0.001,
            outerRadiusAuto: auto(i),
          })),
        },
      ],
    }) as unknown as RocketTree;

  it('builds a run of automatic radii at the browser ceiling, at the sized tube radius, and refuses one more', () => {
    const design = OpenRocketDesign.buildTree(tubes(MAX_AUTO_RADIUS_RUN + 1, (i) => i > 0));
    expect(design.staticInfo().refDiameter).toBeCloseTo(0.04, 9);
    expect(() => OpenRocketDesign.buildTree(tubes(MAX_AUTO_RADIUS_RUN + 2, (i) => i > 0))).toThrow(/in a row/);
  });

  it('builds as many parts as the browser ceiling, and refuses one more', () => {
    expect(() => OpenRocketDesign.buildTree(tubes(MAX_COMPONENTS - 1, () => false))).not.toThrow();
    expect(() => OpenRocketDesign.buildTree(tubes(MAX_COMPONENTS, () => false))).toThrow(
      new RegExp(`more than ${MAX_COMPONENTS} parts`),
    );
  });

  it('builds a parachute at the line count ceiling, and refuses one line more', () => {
    const withLines = (lineCount: number) => {
      const tree = structuredClone(TREE) as unknown as { components: Record<string, unknown>[] };
      const tube = (tree.components[0]!['children'] as Record<string, unknown>[])[1]!;
      tube['children'] = [{ id: 'p', type: 'parachute', diameter: 0.3, cd: 0.8, lineCount }];
      return tree as unknown as RocketTree;
    };
    expect(() => OpenRocketDesign.buildTree(withLines(MAX_LINE_COUNT)).staticInfo()).not.toThrow();
    expect(() => OpenRocketDesign.buildTree(withLines(MAX_LINE_COUNT + 1)).staticInfo()).toThrow(/lineCount/);
  });
});

describe('one handle can be released, and the JSON reader is JSON', () => {
  it('frees one handle without touching another, and refuses an unknown one', () => {
    const a = engine.buildRocket(JSON.stringify(TREE));
    const b = engine.buildRocket(JSON.stringify(TREE));
    engine.free(a);
    expect(JSON.parse(engine.getStaticInfo(a)).error).toMatch(/handle/i);
    expect(JSON.parse(engine.getStaticInfo(b)).mass).toBeGreaterThan(0);
    expect(() => engine.free(a)).toThrow(/Unknown handle/);
  });

  it('refuses numbers JSON.parse refuses', () => {
    for (const bad of ['01', '+0.3', '.3', '1.', '1e']) {
      expect(() => engine.buildRocket(`{"components":[],"x":${bad}}`)).toThrow(/bad number/);
    }
  });

  it('refuses a lone surrogate, and still decodes a pair', () => {
    const named = (escaped: string) => JSON.stringify(TREE).replace('{', `{"name":"${escaped}",`);
    expect(() => engine.buildRocket(named(String.raw`\ud83d`))).toThrow(/surrogate/);
    expect(() => engine.buildRocket(named(String.raw`\ude00`))).toThrow(/surrogate/);
    expect(() => engine.buildRocket(named(String.raw`🚀`))).not.toThrow();
  });

  it('refuses a negative size instead of building a massless part', () => {
    const tree = structuredClone(TREE) as unknown as { components: Record<string, unknown>[] };
    const tube = (tree.components[0]!['children'] as Record<string, unknown>[])[1]!;
    tube['outerRadius'] = -1;
    expect(() => OpenRocketDesign.buildTree(tree as unknown as RocketTree).staticInfo()).toThrow(
      /outerRadius' must not be negative/,
    );
  });
});

describe('motor validation at the boundary', () => {
  it('accepts a well-formed motor', () => {
    const d = build();
    expect(() => d.setMotorById('tube', C6)).not.toThrow();
    expect(d.simulate({ launchRodLength: 1 }).summary.maxAltitude).toBeGreaterThan(0);
  });

  // Direct export calls bypass the JS wrapper's checks.
  it('rejects mismatched curve arrays with a message naming the motor', () => {
    expect(() =>
      engine.setMotorById(
        engine.buildRocket(JSON.stringify(TREE)),
        'tube',
        'BAD',
        0.018,
        0.07,
        [0, 1, 2],
        [0, 50, 0],
        [0.1, 0.05],
        0.035,
        5,
      ),
    ).toThrow(/BAD/);
  });

  it('rejects a non-positive diameter or length', () => {
    const h = engine.buildRocket(JSON.stringify(TREE));
    expect(() => engine.setMotorById(h, 'tube', 'BAD', 0, 0.07, [0, 1], [0, 5], [0.1, 0.05], 0.035, 5)).toThrow(/BAD/);
  });

  it('rejects times that run backwards', () => {
    const h = engine.buildRocket(JSON.stringify(TREE));
    expect(() =>
      engine.setMotorById(h, 'tube', 'BAD', 0.018, 0.07, [0, 2, 1], [0, 5, 0], [0.1, 0.08, 0.05], 0.035, 5),
    ).toThrow(/BAD/);
  });
});

describe('the 7-argument simulate() overload', () => {
  it('returns an error envelope for a non-finite option rather than a JSON parse failure', () => {
    const h = engine.buildRocket(JSON.stringify(TREE));
    engine.setMotorById(h, 'tube', 'C6', 0.018, 0.07, C6.times, C6.thrusts, C6.masses, 0.035, 5);
    const raw = engine.simulate(h, 1, 0, Number.NaN, 0, 0, 0.05);
    const parsed = JSON.parse(raw) as { error?: string };
    expect(parsed.error).toMatch(/finite/i);
  });
});

describe('the aero sweep does not fabricate zeros', () => {
  it('counts the non-finite readings it met, and a healthy sweep meets none', () => {
    const sweep = build().aeroSweep({ machMin: 0.1, machMax: 0.4, machStep: 0.1 }) as unknown as {
      nonFinite?: number;
      components: { cd: (number | null)[] }[];
    };
    expect(sweep.nonFinite).toBe(0);
    expect(sweep.components.length).toBeGreaterThan(0);
  });

  it('emits every per-component cell as a finite number for a sane design', () => {
    const sweep = build().aeroSweep({ machMin: 0.1, machMax: 0.4, machStep: 0.1 });
    for (const c of sweep.components) {
      for (const v of c.cd) {
        expect(Number.isFinite(v), `${c.name} cd`).toBe(true);
      }
    }
  });

  it('sums the component CDs back to the rocket total, with no NaN swallowed', () => {
    const sweep = build().aeroSweep({ machMin: 0.2, machMax: 0.2, machStep: 0.1 });
    const parts = sweep.components.reduce((a, c) => a + (c.cd[0] ?? 0), 0);
    expect(parts).toBeCloseTo(sweep.powerOff.total[0]!, 6);
  });
});

// `getCMAnalysis` is keyed by a per-run random UUID hash, so its order shuffles between builds.
describe('component masses are ordered, not shuffled', () => {
  const names = () =>
    build()
      .componentMasses()
      .map((m) => m.name);

  it('is stable across repeated builds in one session', () => {
    const first = names();
    expect(first.length).toBeGreaterThan(1);
    for (let i = 0; i < 5; i++) expect(names()).toEqual(first);
  });

  it('follows the component tree, nose before fins', () => {
    const order = names();
    const nose = order.findIndex((n) => /nose/i.test(n));
    const fins = order.findIndex((n) => /fin/i.test(n));
    expect(nose).toBeGreaterThanOrEqual(0);
    expect(fins).toBeGreaterThanOrEqual(0);
    expect(nose).toBeLessThan(fins);
  });

  it('survives a reset, which re-registers every component', () => {
    const before = names();
    engine.reset();
    expect(names()).toEqual(before);
  });
});

describe('the bridge passes these options through to the physics', () => {
  const deg = (d: number) => (d * Math.PI) / 180;

  const fly = (options: Record<string, unknown>) => {
    const d = build();
    d.setMotorById('tube', C6);
    // Pinned seed: the default mints a fresh one per run.
    return d.simulate({ randomSeed: 7, ...options } as never).summary.maxAltitude;
  };

  const underG = (g: number) => fly({ gravityModel: 'constant', constantGravity: g });

  it('coasts higher the weaker the constant gravity', () => {
    const [moon, mars, half, earth] = [underG(1.62), underG(3.71), underG(5), underG(9.80665)];
    expect(moon).toBeGreaterThan(mars);
    expect(mars).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(earth);
  });

  it('lands within a meter of WGS when the constant is sea-level g', () => {
    expect(Math.abs(underG(9.80665) - fly({}))).toBeLessThan(1);
  });

  it('flies differently in humid air than in dry air', () => {
    const at = (rh: number) => fly({ temperature: 303.15, pressure: 101325, relativeHumidity: rh });
    expect(at(1)).not.toBe(at(0));
  });

  describe('the maximum angle step', () => {
    // The cap binds only when the rocket rotates: an angled rod in wind.
    const rotating = { launchRodAngle: deg(10), windAverage: 4, windStdDeviation: 0 };

    it('changes the flight once it is tight enough to bind', () => {
      const loose = fly({ ...rotating, maxAngleStep: deg(30) });
      const tight = fly({ ...rotating, maxAngleStep: deg(0.1) });
      expect(tight).not.toBe(loose);
      expect(tight).toBeGreaterThan(0);
    });

    it('tightens monotonically', () => {
      const a = fly({ ...rotating, maxAngleStep: deg(30) });
      const b = fly({ ...rotating, maxAngleStep: deg(0.5) });
      const c = fly({ ...rotating, maxAngleStep: deg(0.1) });
      expect(b).not.toBe(a);
      expect(c).not.toBe(b);
    });

    it('defaults to the kernel RECOMMENDED_ANGLE_STEP when we send nothing', () => {
      // DEFAULT_SETTINGS uses 3 degrees, the kernel's default.
      expect(fly({ ...rotating, maxAngleStep: deg(3) })).toBe(fly(rotating));
    });
  });

  describe('the stepper', () => {
    const windy = { windAverage: 4, windStdDeviation: 0 };

    it('flies RK6 differently from RK4, and RK4 when we send nothing', () => {
      const rk4 = fly({ ...windy, stepper: 'rk4' });
      const rk6 = fly({ ...windy, stepper: 'rk6' });
      expect(rk6).not.toBe(rk4);
      expect(Math.abs(rk6 - rk4)).toBeLessThan(1);
      expect(fly(windy)).toBe(rk4);
    });

    it('refuses a stepper the kernel does not have', () => {
      expect(() => fly({ ...windy, stepper: 'euler' })).toThrow(/stepper/i);
    });
  });
});

describe('a grounded stage leaves the flight', () => {
  const TWO_STAGE = {
    components: [
      {
        id: 'sustainer',
        type: 'stage',
        children: [
          { id: 'nose', type: 'nosecone', length: 0.1, aftRadius: 0.013, thickness: 0.001, shape: 'ogive' },
          { id: 'upper', type: 'bodytube', length: 0.2, outerRadius: 0.013, thickness: 0.0005 },
        ],
      },
      {
        id: 'booster',
        type: 'stage',
        children: [
          {
            id: 'lower',
            type: 'bodytube',
            length: 0.3,
            outerRadius: 0.013,
            thickness: 0.0005,
            motorMount: true,
            children: [
              {
                id: 'lower-fins',
                type: 'trapezoidfinset',
                finCount: 3,
                rootChord: 0.06,
                tipChord: 0.03,
                sweep: 0.03,
                height: 0.05,
                thickness: 0.003,
              },
            ],
          },
        ],
      },
    ],
  } as unknown as RocketTree;

  it("drops the stage's mass and length from the static info", () => {
    const whole = OpenRocketDesign.buildTree(TWO_STAGE).staticInfo();
    const design = OpenRocketDesign.buildTree(TWO_STAGE);
    design.setStageActiveById('booster', false);
    const sustainerOnly = design.staticInfo();

    expect(sustainerOnly.mass).toBeLessThan(whole.mass);
    expect(sustainerOnly.length).toBeLessThan(whole.length);
  });

  it("leaves the booster's motor out of the loaded mass", () => {
    const design = OpenRocketDesign.buildTree(TWO_STAGE);
    design.setMotorById('lower', C6);
    const loaded = design.staticInfo().mass;

    const grounded = OpenRocketDesign.buildTree(TWO_STAGE);
    grounded.setMotorById('lower', C6);
    grounded.setStageActiveById('booster', false);
    expect(grounded.staticInfo().mass).toBeLessThan(loaded - C6.masses![0]! / 2);
  });

  it('refuses an id that is not a stage, by name', () => {
    const design = OpenRocketDesign.buildTree(TWO_STAGE);
    expect(() => design.setStageActiveById('nose', false)).toThrow(/not a stage/i);
  });
});

// The drogue-low-speed check is enabled by PATCH(drogue-low-speed) in BasicEventSimulationEngine.
describe('dual deployment reaches the kernel', () => {
  const dualTree = (drogue: boolean) =>
    ({
      components: [
        {
          id: 'stage1',
          type: 'stage',
          children: [
            { id: 'nose', type: 'nosecone', length: 0.1, aftRadius: 0.013, thickness: 0.001, shape: 'ogive' },
            {
              id: 'tube',
              type: 'bodytube',
              length: 0.2,
              outerRadius: 0.013,
              thickness: 0.0005,
              motorMount: true,
              children: [
                {
                  id: 'fins',
                  type: 'trapezoidfinset',
                  finCount: 3,
                  rootChord: 0.06,
                  tipChord: 0.03,
                  sweep: 0.03,
                  height: 0.05,
                  thickness: 0.003,
                },
                {
                  id: 'drogue',
                  type: 'parachute',
                  diameter: 0.15,
                  cd: 0.8,
                  lineCount: 6,
                  lineLength: 0.2,
                  drogue,
                  deployEvent: 'apogee',
                  deployDelay: 0,
                },
                {
                  id: 'main',
                  type: 'parachute',
                  diameter: 0.4,
                  cd: 0.8,
                  lineCount: 6,
                  lineLength: 0.3,
                  deployEvent: 'altitude',
                  deployAltitude: 60,
                  deployDelay: 0,
                },
              ],
            },
          ],
        },
      ],
    }) as unknown as RocketTree;

  const keys = (tree: RocketTree, options: Record<string, unknown>) => {
    const d = OpenRocketDesign.buildTree(tree);
    d.setMotorById('tube', C6);
    const r = d.simulate({ randomSeed: 7, ...options } as never);
    return (r.warnings ?? []).map((w) => w.key);
  };

  it('warns about a slow drogue at apogee once the threshold is high enough', () => {
    expect(keys(dualTree(true), { drogueLowSpeedWarn: 50 })).toContain('RECOVERY_DROGUE_LOW_SPEED');
    expect(keys(dualTree(true), { drogueLowSpeedWarn: 0 })).not.toContain('RECOVERY_DROGUE_LOW_SPEED');
  });

  it('stays silent when the same chute is not marked as a drogue', () => {
    expect(keys(dualTree(false), { drogueLowSpeedWarn: 50 })).not.toContain('RECOVERY_DROGUE_LOW_SPEED');
  });

  it('judges the main against the dual-deployment thresholds, not the single one', () => {
    const low = { mainHighSpeedWarn: 0.1, recoverySpeedWarn: 1000 };
    expect(keys(dualTree(true), low)).toContain('RECOVERY_MAIN_HIGH_SPEED');
    expect(keys(dualTree(false), low)).not.toContain('RECOVERY_MAIN_HIGH_SPEED');
  });
});

describe('a mass component can hold internal components', () => {
  const withNested = (nested: boolean) =>
    ({
      components: [
        {
          id: 'stage1',
          type: 'stage',
          children: [
            { id: 'nose', type: 'nosecone', length: 0.1, aftRadius: 0.013, thickness: 0.001, shape: 'ogive' },
            {
              id: 'tube',
              type: 'bodytube',
              length: 0.2,
              outerRadius: 0.013,
              thickness: 0.0005,
              children: [
                {
                  id: 'bay',
                  type: 'masscomponent',
                  mass: 0.02,
                  length: 0.02,
                  radius: 0.005,
                  ...(nested
                    ? { children: [{ id: 'bh', type: 'bulkhead', outerRadius: 0.012, thickness: 0.003 }] }
                    : {}),
                },
              ],
            },
          ],
        },
      ],
    }) as unknown as RocketTree;

  it('builds instead of throwing out of addChild', () => {
    expect(() => OpenRocketDesign.buildTree(withNested(true))).not.toThrow();
  });

  it('counts the nested part in the rocket mass', () => {
    const massOf = (nested: boolean) => OpenRocketDesign.buildTree(withNested(nested)).staticInfo().mass;
    expect(massOf(true)).toBeGreaterThan(massOf(false));
  });
});

describe('fin fillets are flown, not just stored', () => {
  const filleted = (radius: number, density?: number) =>
    ({
      components: [
        {
          id: 'stage1',
          type: 'stage',
          children: [
            { id: 'nose', type: 'nosecone', length: 0.1, aftRadius: 0.013, thickness: 0.001, shape: 'ogive' },
            {
              id: 'tube',
              type: 'bodytube',
              length: 0.2,
              outerRadius: 0.013,
              thickness: 0.0005,
              children: [
                {
                  id: 'fins',
                  type: 'trapezoidfinset',
                  finCount: 3,
                  rootChord: 0.06,
                  tipChord: 0.03,
                  sweep: 0.03,
                  height: 0.05,
                  thickness: 0.003,
                  filletRadius: radius,
                  ...(density === undefined ? {} : { filletDensity: density, filletMaterialName: 'Epoxy' }),
                },
              ],
            },
          ],
        },
      ],
    }) as unknown as RocketTree;

  const massOf = (radius: number, density?: number) =>
    OpenRocketDesign.buildTree(filleted(radius, density)).staticInfo().massEmpty;

  it('adds the fillet to the rocket mass, and more of it for a bigger bead', () => {
    const none = massOf(0);
    expect(massOf(0.003)).toBeGreaterThan(none);
    expect(massOf(0.006)).toBeGreaterThan(massOf(0.003));
  });

  it("weighs the bead in ITS OWN material, not the fin's", () => {
    expect(massOf(0.006, 1250)).toBeGreaterThan(massOf(0.006));
  });

  it('moves the CG, since the bead sits along the root at the aft end', () => {
    const cg = (r: number) => OpenRocketDesign.buildTree(filleted(r)).staticInfo().cgEmpty;
    expect(cg(0.006)).toBeGreaterThan(cg(0));
  });
});

// Transition caps are per side, unlike the nose cone's single `shoulderCapped`.
const withTransition = (shoulder: Record<string, unknown>) =>
  ({
    components: [
      {
        id: 'stage1',
        type: 'stage',
        children: [
          { id: 'nose', type: 'nosecone', length: 0.1, aftRadius: 0.02, thickness: 0.001, shape: 'ogive' },
          { id: 'upper', type: 'bodytube', length: 0.2, outerRadius: 0.02, thickness: 0.001 },
          {
            id: 'trans',
            type: 'transition',
            shape: 'conical',
            length: 0.05,
            foreRadius: 0.02,
            aftRadius: 0.013,
            thickness: 0.001,
            foreShoulderRadius: 0.019,
            foreShoulderLength: 0.03,
            aftShoulderRadius: 0.012,
            aftShoulderLength: 0.03,
            ...shoulder,
          },
          { id: 'lower', type: 'bodytube', length: 0.2, outerRadius: 0.013, thickness: 0.001 },
        ],
      },
    ],
  }) as unknown as RocketTree;

const massOf = (tree: RocketTree) => OpenRocketDesign.buildTree(tree).staticInfo().massEmpty;

describe("a transition's shoulders weigh what they are built from", () => {
  it('a shoulder with a wall weighs more than one without', () => {
    const bare = massOf(withTransition({}));
    const walled = massOf(withTransition({ foreShoulderThickness: 0.002, aftShoulderThickness: 0.002 }));
    expect(walled).toBeGreaterThan(bare);
  });

  it('capping either end adds the disc that closes it', () => {
    const walls = { foreShoulderThickness: 0.002, aftShoulderThickness: 0.002 };
    const open = massOf(withTransition(walls));
    const foreCapped = massOf(withTransition({ ...walls, foreShoulderCapped: true }));
    const bothCapped = massOf(withTransition({ ...walls, foreShoulderCapped: true, aftShoulderCapped: true }));
    expect(foreCapped).toBeGreaterThan(open);
    expect(bothCapped).toBeGreaterThan(foreCapped);
  });

  it('flies an absent shoulder wall as the 0 the panel and the .ork state', () => {
    // Transition.setForeShoulderLength seeds a wall from 0, so the bridge sets thickness after length.
    const caps = { foreShoulderCapped: true, aftShoulderCapped: true };
    const absent = massOf(withTransition(caps));
    const stated = massOf(withTransition({ ...caps, foreShoulderThickness: 0, aftShoulderThickness: 0 }));
    expect(absent).toBe(stated);
  });

  it('flies a stated wall', () => {
    const auto = massOf(withTransition({ foreShoulderCapped: true, aftShoulderCapped: true }));
    const thick = massOf(
      withTransition({
        foreShoulderCapped: true,
        aftShoulderCapped: true,
        foreShoulderThickness: 0.003,
        aftShoulderThickness: 0.003,
      }),
    );
    expect(thick).toBeGreaterThan(auto);
  });
});

const withPart = (part: Record<string, unknown>) =>
  ({
    components: [
      {
        id: 'stage1',
        type: 'stage',
        children: [
          { id: 'nose', type: 'nosecone', length: 0.1, aftRadius: 0.02, thickness: 0.001, shape: 'ogive' },
          {
            id: 'tube',
            type: 'bodytube',
            length: 0.3,
            outerRadius: 0.02,
            thickness: 0.001,
            children: [part],
          },
        ],
      },
    ],
  }) as unknown as RocketTree;

const dryMass = (tree: RocketTree) => OpenRocketDesign.buildTree(tree).staticInfo().massEmpty;

describe('part fields the bridge forwards reach the kernel', () => {
  it('weighs a rail button at its own geometry, not the kernel default', () => {
    const stock = dryMass(withPart({ id: 'rb', type: 'railbutton', outerDiameter: 0.0097 }));
    const tall = dryMass(
      withPart({ id: 'rb', type: 'railbutton', outerDiameter: 0.0097, height: 0.03, baseHeight: 0.006 }),
    );
    expect(tall).toBeGreaterThan(stock);
  });

  it('builds every instance of a repeated ring', () => {
    const bare = dryMass(withPart({ id: 'x', type: 'bulkhead', length: 0.0001, outerRadius: 0.0001 }));
    const one = dryMass(withPart({ id: 'cr', type: 'centeringring', length: 0.003, outerRadius: 0.019 })) - bare;
    const three =
      dryMass(
        withPart({
          id: 'cr',
          type: 'centeringring',
          length: 0.003,
          outerRadius: 0.019,
          instanceCount: 3,
          instanceSeparation: 0.02,
        }),
      ) - bare;
    expect(one).toBeGreaterThan(0);
    expect(three / one).toBeCloseTo(3, 1);
  });

  it('moves a mass object off the axis when the design says so', () => {
    const roll = (radialPosition: number) =>
      OpenRocketDesign.buildTree(
        withPart({ id: 'm', type: 'masscomponent', mass: 0.05, length: 0.02, radius: 0.005, radialPosition }),
      ).staticInfo().rollInertia;
    // Not a ring: upstream `RingComponent.getComponentCG` ignores shiftY/shiftZ.
    expect(roll(0.012)).toBeGreaterThan(roll(0));
  });

  it.each([
    { type: 'parachute', diameter: 0.4, cd: 0.8 },
    { type: 'streamer', stripLength: 0.5, stripWidth: 0.05 },
    { type: 'shockcord', cordLength: 1 },
  ])('moves a $type off the axis when the design says so', (part) => {
    const roll = (radialPosition: number) =>
      OpenRocketDesign.buildTree(
        withPart({ id: 'r', ...part, length: 0.05, radius: 0.005, radialPosition, radialDirection: 1 }),
      ).staticInfo().rollInertia;
    expect(roll(0.012)).toBeGreaterThan(roll(0));
  });

  it('packs a recovery device at the radius the design gives it', () => {
    const narrow = OpenRocketDesign.buildTree(
      withPart({ id: 'p', type: 'parachute', diameter: 0.4, cd: 0.8, length: 0.05, radius: 0.005 }),
    ).staticInfo().rollInertia;
    const wide = OpenRocketDesign.buildTree(
      withPart({ id: 'p', type: 'parachute', diameter: 0.4, cd: 0.8, length: 0.05, radius: 0.018 }),
    ).staticInfo().rollInertia;
    expect(wide).toBeGreaterThan(narrow);
  });

  it('flies a flipped nose cone as a tail cone', () => {
    const cg = (flip: boolean) => {
      const t = withPart({ id: 'x', type: 'centeringring', length: 0.003 });
      const nose = (t.components[0] as unknown as { children: Record<string, unknown>[] }).children[0]!;
      nose['flipped'] = flip;
      return OpenRocketDesign.buildTree(t).staticInfo().cgEmpty;
    };
    expect(cg(true)).not.toBeCloseTo(cg(false), 4);
  });

  it('takes the fin cross-section, which changes the fin volume', () => {
    const square = dryMass(
      withPart({
        id: 'f',
        type: 'trapezoidfinset',
        finCount: 3,
        rootChord: 0.06,
        tipChord: 0.03,
        height: 0.04,
        thickness: 0.004,
        crossSection: 'square',
      }),
    );
    const airfoil = dryMass(
      withPart({
        id: 'f',
        type: 'trapezoidfinset',
        finCount: 3,
        rootChord: 0.06,
        tipChord: 0.03,
        height: 0.04,
        thickness: 0.004,
        crossSection: 'airfoil',
      }),
    );
    expect(airfoil).toBeLessThan(square);
  });
});

describe('a filled component is solid', () => {
  const tubeTree = (filled: boolean) =>
    ({
      components: [
        {
          id: 'stage1',
          type: 'stage',
          children: [
            { id: 'nose', type: 'nosecone', length: 0.1, aftRadius: 0.02, thickness: 0.001, shape: 'ogive' },
            { id: 'tube', type: 'bodytube', length: 0.3, outerRadius: 0.02, thickness: 0.001, filled },
          ],
        },
      ],
    }) as unknown as RocketTree;

  it('weighs a solid body tube more than a walled one', () => {
    expect(dryMass(tubeTree(true))).toBeGreaterThan(dryMass(tubeTree(false)));
  });
});

// On a crossing, `FreeformFinSet.setPoints` silently rolls back to the previous outline.
describe('a self-intersecting freeform fin outline is refused', () => {
  const finTree = (points?: number[][], name?: string) =>
    ({
      components: [
        {
          id: 'stage1',
          type: 'stage',
          children: [
            { id: 'nose', type: 'nosecone', length: 0.1, aftRadius: 0.013, thickness: 0.001, shape: 'ogive' },
            {
              id: 'tube',
              type: 'bodytube',
              length: 0.2,
              outerRadius: 0.013,
              thickness: 0.0005,
              children: [
                {
                  id: 'fins',
                  type: 'freeformfinset',
                  ...(name ? { name } : {}),
                  finCount: 3,
                  thickness: 0.003,
                  ...(points ? { points } : {}),
                },
              ],
            },
          ],
        },
      ],
    }) as unknown as RocketTree;

  const VALID = [
    [0, 0],
    [0.02, 0.05],
    [0.05, 0.05],
    [0.06, 0],
  ];
  const BOWTIE = [
    [0, 0],
    [0.05, 0.05],
    [0, 0.05],
    [0.06, 0],
  ];
  const REPEATED = [
    [0, 0],
    [0.02, 0.05],
    [0.02, 0.05],
    [0.06, 0],
  ];

  const info = (points?: number[][]) => OpenRocketDesign.buildTree(finTree(points, 'Forward fins')).staticInfo();

  it('builds a valid outline at its own length', () => {
    expect(info(VALID).length).toBeCloseTo(0.3, 9);
  });

  it('refuses a crossing outline, naming the fin set', () => {
    expect(() => info(BOWTIE)).toThrow(/Forward fins/);
    expect(() => info(BOWTIE)).toThrow(/crosses or touches itself/);
  });

  // The fin editor refuses an edit by the same test; on a 1 mm grid, touching and collinear edges are common.
  it('refuses exactly the outlines the fin editor refuses', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const mm = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo)) / 1000;
    const outlines = [VALID, BOWTIE, REPEATED];
    for (let k = 0; k < 150; k++) {
      const interior = Array.from({ length: 2 + (k % 5) }, () => [mm(-20, 80), mm(0, 60)]);
      outlines.push([[0, 0], ...interior, [mm(10, 80), 0]]);
    }
    const kernelRefuses = (points: number[][]) => {
      try {
        info(points);
        return false;
      } catch (e) {
        if (/crosses or touches itself/.test(String(e))) return true;
        throw e;
      }
    };
    const verdicts = outlines.map((p) => [kernelRefuses(p), outlineCrossesItself(p as [number, number][])]);
    expect(verdicts.filter(([kernel, editor]) => kernel !== editor)).toEqual([]);
    expect(new Set(verdicts.map(([kernel]) => kernel)).size).toBe(2);
  });

  it('refuses an outline with a repeated point', () => {
    expect(() => info(REPEATED)).toThrow(/crosses or touches itself/);
  });

  it('falls back on the type when the fin set has no name', () => {
    expect(() => OpenRocketDesign.buildTree(finTree(BOWTIE)).staticInfo()).toThrow(/freeform fin set/);
  });

  it('does not fly the default fin in place of the refused one', () => {
    const fallback = info();
    expect(fallback.length).toBeCloseTo(0.325, 9);
    let flew: number | null = null;
    try {
      flew = info(BOWTIE).length;
    } catch {
      /* refused, which is the point */
    }
    expect(flew).not.toBe(fallback.length);
  });

  it('builds a good outline after a refused one', () => {
    expect(() => info(BOWTIE)).toThrow();
    expect(info(VALID).length).toBeCloseTo(0.3, 9);
  });
});

describe('the standard atmosphere comes from the kernel', () => {
  it('gives the standard pressure at sea level and at a high site', () => {
    expect(standardPressurePa(0)).toBeCloseTo(101_325, 0);
    expect(Math.abs(standardPressurePa(1500)! - 84_556)).toBeLessThan(50);
  });

  it('refuses an altitude that is not a number', () => {
    expect(() => standardPressurePa(Number.NaN)).toThrow();
  });
});
