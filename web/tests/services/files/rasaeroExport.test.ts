// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { PLUGGED_DELAY, type RocketTree } from '../../../src/engine/openRocketEngine';
import type { LaunchConditions } from '../../../src/services/design/orkTree';
import { exportCdx1 } from '../../../src/services/files/rasaeroExport';
import { IN, fmt } from '../../../src/services/files/rasaero/units';
import { stageEngineSlots, type Cdx1ExportEngine } from '../../../src/services/files/rasaero/engines';
import { KERNEL_DEFAULTS } from '../../../src/tree/kernelDefaults';
import {
  rasaeroSurface,
  RASAERO_SURFACE_DEFAULT,
  RASAERO_SURFACE_WARNING,
} from '../../../src/services/files/rasaero/surface';
import type { Keyed } from '../../../src/i18n/keyedError';

// A 1-inch-diameter rocket with clean-inch geometry so the meter→inch (×39.37)
// conversions land on round numbers the assertions can pin exactly.
const tree: RocketTree = {
  name: 'Test Bird',
  components: [
    {
      type: 'stage',
      name: 'Sustainer',
      children: [
        { type: 'nosecone', id: 'nc', length: 0.1, aftRadius: 0.0127, shape: 'ogive', thickness: 0.001 },
        {
          type: 'bodytube',
          id: 'bt',
          length: 0.254, // 10 in
          outerRadius: 0.0127, // 1 in dia
          children: [
            {
              type: 'trapezoidfinset',
              id: 'fin',
              finCount: 3,
              rootChord: 0.0508, // 2 in
              tipChord: 0.0254, // 1 in
              sweep: 0.0254, // 1 in
              height: 0.0254, // 1 in span
              thickness: 0.003,
              position: { method: 'bottom', offset: 0 },
            },
            {
              type: 'launchlug',
              id: 'lug',
              length: 0.0254,
              outerRadius: 0.002,
              position: { method: 'middle', offset: 0 },
            },
          ],
        },
      ],
    },
  ],
};

describe('exportCdx1', () => {
  const xml = exportCdx1({ tree, name: 'Test Bird', launchMassKg: 0.45359237, launchCgM: 0.127 });

  it('is well-formed XML rooted at RASAeroDocument (FileVersion 2)', () => {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelector('RASAeroDocument > FileVersion')?.textContent).toBe('2');
    expect(doc.querySelector('RASAeroDocument > RocketDesign')).not.toBeNull();
  });

  it('writes the nose cone with mapped shape and inch diameter', () => {
    expect(xml).toContain('<Shape>Tangent Ogive</Shape>');
    // aftRadius 0.0127 m → diameter 0.0254 m → 1 in.
    expect(xml).toMatch(/<NoseCone>[\s\S]*?<Diameter>1<\/Diameter>/);
  });

  it('writes the body tube with the launch lug and its fin set', () => {
    expect(xml).toMatch(/<BodyTube>[\s\S]*?<LaunchLugLength>1<\/LaunchLugLength>/);
    expect(xml).toContain('<Count>3</Count>');
    expect(xml).toContain('<Chord>2</Chord>'); // rootChord 2 in
    expect(xml).toContain('<Span>1</Span>'); // height 1 in
    expect(xml).toContain('<TipChord>1</TipChord>');
  });

  it('fills the mandatory simulation block with loaded weight (lb) and CG (in)', () => {
    // 0.45359237 kg → 1.000 lb; 0.127 m → 5 in.
    expect(xml).toContain('<SustainerLaunchWt>1</SustainerLaunchWt>');
    expect(xml).toContain('<SustainerCG>5</SustainerCG>');
    expect(xml).toContain('</SimulationList>');
  });

  // An absolute station is from the nose tip: 0.1 of nose plus the 0.254 tube,
  // less the 0.0508 root, is the same fin set flush with the tube's aft end.
  it('places an absolute fin set by its station from the nose tip', () => {
    const at = (position: object): string => {
      const t = structuredClone(tree);
      t.components[0]!.children![1]!.children![0]!.position = position as never;
      const out = exportCdx1({ tree: t, name: 'Test Bird' });
      return /<Fin>[\s\S]*?<Location>([^<]*)<\/Location>/.exec(out)![1]!;
    };
    expect(at({ method: 'absolute', offset: 0.1 + 0.254 - 0.0508 })).toBe(at({ method: 'bottom', offset: 0 }));
    expect(at({ method: 'absolute', offset: 0.1 })).toBe(at({ method: 'top', offset: 0 }));
  });

  it('rejects a design RASAero cannot represent (tube fins)', () => {
    const bad: RocketTree = {
      components: [
        {
          type: 'stage',
          children: [
            { type: 'bodytube', length: 0.2, outerRadius: 0.012, children: [{ type: 'tubefinset', finCount: 4 }] },
          ],
        },
      ],
    };
    expect(() => exportCdx1({ tree: bad, name: 'bad' })).toThrow(/RASAero/);
  });
});

/**
 * The surface table is the desktop's RASAeroCommonConstants
 * .OPENROCKET_TO_RASAERO_SURFACE, row for row. It does not send `polished` to
 * Sheet Metal or `smooth` to Smooth Paint; POLISHED shares Polished and ROUGH
 * Cast Iron, the nearest RASAero roughnesses. Only text no finish is falls to
 * its default with a warning.
 */
describe('finish to RASAero surface (desktop table)', () => {
  it.each([
    ['mirror', 'Smooth (Zero Roughness)'],
    ['finishpolished', 'Polished'],
    ['polished', 'Polished'],
    ['optimum', 'Sheet Metal'],
    ['smooth', 'Camouflage Paint'],
    ['normal', 'Rough Camouflage Paint'],
    ['unfinished', 'Galvanized Metal'],
    ['roughunfinished', 'Cast Iron (Very Rough)'],
    ['rough', 'Cast Iron (Very Rough)'],
  ])('%s maps to %s without a warning', (finish, surface) => {
    expect(rasaeroSurface(finish)).toEqual({ surface });
  });

  it('falls to Smooth with the desktop warning for a finish with no row', () => {
    const r = rasaeroSurface('nosuchfinish');
    expect(r.surface).toBe(RASAERO_SURFACE_DEFAULT);
    expect(r.warning).toEqual(RASAERO_SURFACE_WARNING);
  });

  const withFinish = (nose: string | undefined, tube: string | undefined): RocketTree => ({
    components: [
      {
        type: 'stage',
        children: [
          {
            type: 'nosecone',
            id: 'nc',
            length: 0.1,
            aftRadius: 0.0127,
            shape: 'ogive',
            ...(nose ? { finish: nose } : {}),
          },
          { type: 'bodytube', id: 'bt', length: 0.254, outerRadius: 0.0127, ...(tube ? { finish: tube } : {}) },
        ],
      },
    ],
  });

  it('takes the finish of one finish throughout without a warning', () => {
    const warnings: Keyed[] = [];
    expect(exportCdx1({ tree: withFinish('optimum', 'optimum'), name: 'x', warnings })).toContain(
      '<Surface>Sheet Metal</Surface>',
    );
    // No finish key is the kernel's NORMAL.
    expect(exportCdx1({ tree: withFinish(undefined, undefined), name: 'x', warnings })).toContain(
      '<Surface>Rough Camouflage Paint</Surface>',
    );
    expect(warnings.map((k) => k.key)).not.toContain('errors.exportRasaeroSurfaceMixed');
  });

  // RocketDesignDTO.getPredominantFinish: the finish of most of the wetted
  // area, not the nose cone's. The 10 in tube outweighs the 4 in nose.
  it('takes the finish of most of the wetted area, with a warning naming it', () => {
    const warnings: Keyed[] = [];
    const xml = exportCdx1({ tree: withFinish('mirror', 'unfinished'), name: 'x', warnings });
    expect(xml).toContain('<Surface>Galvanized Metal</Surface>');
    expect(warnings).toContainEqual({
      key: 'errors.exportRasaeroSurfaceMixed',
      values: { finish: { key: 'finish.unfinished' } },
    });
  });

  it('counts both faces of every fin', () => {
    // The 1 in tube's 10 in is 31.4 in^2 and the nose some 7 in^2 more. Eight
    // fins with a 2 in root and a 1 in tip are 1.5 in^2 a face at a 1 in span,
    // 24 in^2 in all, and 5.9 in^2 a face at a 0.1 m span, 94 in^2.
    const finned = (height: number) => {
      const t = withFinish('normal', 'normal');
      const fin = { ...tree.components[0]!.children![1]!.children![0]!, finCount: 8, height, finish: 'mirror' };
      t.components[0]!.children![1]!.children = [fin];
      return t;
    };
    expect(exportCdx1({ tree: finned(0.0254), name: 'x' })).toContain('<Surface>Rough Camouflage Paint</Surface>');
    expect(exportCdx1({ tree: finned(0.1), name: 'x' })).toContain('<Surface>Smooth (Zero Roughness)</Surface>');
  });

  it('collects the warning for a finish with no row', () => {
    const warnings: Keyed[] = [];
    const tree = withFinish('nosuchfinish', 'nosuchfinish');
    const xml = exportCdx1({ tree, name: 'x', launchMassKg: 0.45, launchCgM: 0.12, warnings });
    expect(xml).toContain('<Surface>Smooth (Zero Roughness)</Surface>');
    expect(warnings).toEqual([RASAERO_SURFACE_WARNING]);
  });
});

/**
 * A pod or a strap-on booster is external aerodynamics RASAero's flat part
 * list cannot hold, and a file that quietly omits it describes a different
 * rocket. The editor mounts both on a body tube (`canHost`), so that is where
 * the export has to find them, in the sustainer and in a booster alike.
 */
describe('assemblies RASAero cannot hold', () => {
  const pod = (type: 'podset' | 'parallelstage') => ({
    type,
    id: 'asm',
    name: 'Side pod',
    children: [{ type: 'bodytube', length: 0.1, outerRadius: 0.005 }],
  });
  const onSustainer = (type: 'podset' | 'parallelstage'): RocketTree =>
    ({
      components: [
        {
          type: 'stage',
          children: [
            { type: 'nosecone', id: 'nc', length: 0.1, aftRadius: 0.0127, shape: 'ogive' },
            { type: 'bodytube', id: 'bt', length: 0.254, outerRadius: 0.0127, children: [pod(type)] },
          ],
        },
      ],
    }) as RocketTree;
  const onBooster = (): RocketTree =>
    ({
      components: [
        tree.components[0]!,
        {
          type: 'stage',
          name: 'Booster',
          children: [
            {
              type: 'bodytube',
              id: 'bb',
              length: 0.2,
              outerRadius: 0.0127,
              children: [{ ...tree.components[0]!.children![1]!.children![0]!, id: 'bf' }, pod('podset')],
            },
          ],
        },
      ],
    }) as RocketTree;

  it('refuses a pod set on a body tube by name rather than dropping it', () => {
    expect(() => exportCdx1({ tree: onSustainer('podset'), name: 'x' })).toThrow(/pods.*Side pod/);
  });

  it('refuses a parallel stage on a body tube by name rather than dropping it', () => {
    expect(() => exportCdx1({ tree: onSustainer('parallelstage'), name: 'x' })).toThrow(/strap-on.*Side pod/);
  });

  it("refuses a pod set on a booster's tube", () => {
    expect(() => exportCdx1({ tree: onBooster(), name: 'x', stageLaunch: [] })).toThrow(/pods.*Side pod/);
  });
});

/**
 * A booster is held to the rules of desktop's `BoosterDTO` (core
 * file/rasaero/export/BoosterDTO.java): consecutive body tubes of the first
 * tube's radius are one body (their lengths summed), the first part after them
 * that is not one refuses the export unless it is the last stage's boat tail
 * (error31), a leading transition is a shoulder whose ends meet the part above
 * and the tube behind (error12 to error15), and the body carries a fin set
 * (error16).
 */
describe('a booster as desktop writes one', () => {
  const finSet = (id: string) => ({ ...tree.components[0]!.children![1]!.children![0]!, id });
  const tube = (id: string, length: number, outerRadius: number, fins = false) => ({
    type: 'bodytube',
    id,
    name: id,
    length,
    outerRadius,
    ...(fins ? { children: [finSet(`${id}f`)] } : {}),
  });
  const twoStage = (boosterParts: unknown[]): RocketTree =>
    ({
      name: 'Two',
      components: [tree.components[0]!, { type: 'stage', id: 'b', name: 'Booster', children: boosterParts }],
    }) as RocketTree;
  const cells = [
    { massKg: 0.4, cgM: 0.15 },
    { massKg: 0.8, cgM: 0.3 },
  ];
  const run = (parts: unknown[]) => exportCdx1({ tree: twoStage(parts), name: 'Two', stageLaunch: cells });
  const booster = (xml: string) => xml.match(/<Booster>[\s\S]*?<\/Booster>/)![0];

  it('joins consecutive tubes of one radius into one body', () => {
    // 0.1 m + 0.154 m = 0.254 m, 10 in.
    const xml = booster(run([tube('t1', 0.1, 0.0127, true), tube('t2', 0.154, 0.0127)]));
    expect(xml).toContain('<Length>10</Length>');
    expect(xml).toContain('<Diameter>1</Diameter>');
  });

  it('refuses a tube of another radius after the body', () => {
    expect(() => run([tube('t1', 0.1, 0.0127, true), tube('t2', 0.1, 0.02)])).toThrow(
      expect.objectContaining({ key: 'errors.rasaero.boosterTubeSize', values: { stage: 'Booster' } }),
    );
  });

  it('refuses a booster with no fin set', () => {
    expect(() => run([tube('t1', 0.254, 0.0127)])).toThrow(
      expect.objectContaining({ key: 'errors.rasaero.boosterNoFins', values: { stage: 'Booster', name: 't1' } }),
    );
  });

  it('refuses a booster that starts with a nose cone', () => {
    expect(() =>
      run([
        { type: 'nosecone', id: 'n', name: 'Cap', length: 0.05, aftRadius: 0.0127, shape: 'ogive' },
        tube('t1', 0.2, 0.0127, true),
      ]),
    ).toThrow(expect.objectContaining({ key: 'errors.rasaero.boosterFirstPart' }));
  });

  const shoulder = (fore: number, aft: number) => ({
    type: 'transition',
    id: 's',
    name: 'Shoulder',
    shape: 'conical',
    length: 0.03,
    foreRadius: fore,
    aftRadius: aft,
  });

  it('takes a leading transition whose ends meet its neighbors as the shoulder', () => {
    const xml = booster(run([shoulder(0.0127, 0.02), tube('t1', 0.254, 0.02, true)]));
    // 0.03 m is 1.1811 in; the inside diameter is the shoulder's fore end, 1 in.
    expect(xml).toContain('<ShoulderLength>1.1811</ShoulderLength>');
    expect(xml).toContain('<InsideDiameter>1</InsideDiameter>');
  });

  it('refuses a shoulder that does not meet the part above', () => {
    expect(() => run([shoulder(0.01, 0.02), tube('t1', 0.254, 0.02, true)])).toThrow(
      expect.objectContaining({ key: 'errors.rasaero.boosterShoulderFore' }),
    );
  });

  it('refuses a shoulder that does not meet the tube behind it', () => {
    expect(() => run([shoulder(0.0127, 0.02), tube('t1', 0.254, 0.025, true)])).toThrow(
      expect.objectContaining({ key: 'errors.rasaero.boosterShoulderAft' }),
    );
  });

  it('refuses a shoulder with no body tube behind it', () => {
    expect(() => run([shoulder(0.0127, 0.02)])).toThrow(
      expect.objectContaining({ key: 'errors.rasaero.boosterShoulderTube' }),
    );
  });
});

describe('rail button as RASAero rail guide', () => {
  const withButton = (button: Record<string, unknown> | null): RocketTree => ({
    components: [
      {
        type: 'stage',
        children: [
          { type: 'nosecone', id: 'nc', length: 0.1, aftRadius: 0.0127, shape: 'ogive' },
          {
            type: 'bodytube',
            id: 'bt',
            length: 0.254,
            outerRadius: 0.0127,
            children: button ? [{ type: 'railbutton', id: 'rb', ...button }] : [],
          },
        ],
      },
    ],
  });

  it('writes the outer diameter and total height in inches', () => {
    // 0.0127 m is 0.5 in; 0.0254 m is 1 in.
    const xml = exportCdx1({ tree: withButton({ outerDiameter: 0.0127, height: 0.0254 }), name: 'x' });
    expect(xml).toContain('<RailGuideDiameter>0.5</RailGuideDiameter>');
    expect(xml).toContain('<RailGuideHeight>1</RailGuideHeight>');
  });

  it('falls back to the desktop button size for a bare node, and 0 with no button', () => {
    const xml = exportCdx1({ tree: withButton({}), name: 'x' });
    expect(xml).toContain(`<RailGuideDiameter>${(0.0097 * 39.37).toFixed(4).replace(/0+$/, '')}</RailGuideDiameter>`);
    expect(xml).toContain(`<RailGuideHeight>${(0.0097 * 39.37).toFixed(4).replace(/0+$/, '')}</RailGuideHeight>`);
    const none = exportCdx1({ tree: withButton(null), name: 'x' });
    expect(none).toContain('<RailGuideDiameter>0</RailGuideDiameter>');
    expect(none).toContain('<RailGuideHeight>0</RailGuideHeight>');
  });
});

/**
 * A non-finite number never reaches the file as text. A bare
 * `typeof === 'number'` check would let a NaN or Infinity on a node through, and
 * the writer would print "NaN" into the .CDX1. The shared `num` rejects it and
 * falls back, as every other reader does.
 */
describe('a non-finite dimension', () => {
  it('is never written as NaN or Infinity', () => {
    const bad = structuredClone(tree);
    const body = bad.components[0]!.children![1]!;
    body['length'] = Number.NaN;
    body['outerRadius'] = Number.POSITIVE_INFINITY;
    // Both fall back to the kernel's 0.025 m, so the tube still meets the nose.
    bad.components[0]!.children![0]!['aftRadius'] = Number.POSITIVE_INFINITY;
    const out = exportCdx1({ tree: bad, name: 'bad', launchMassKg: 0.45, launchCgM: 0.127 });
    expect(out).not.toMatch(/NaN|Infinity/);
  });
});

/**
 * A trapezoid fin with no sweep key exports the kernel's default sweep
 * (`KERNEL_DEFAULTS.trapezoidfinset.sweep`), which is what the engine flies for that node.
 */
describe('a trapezoid fin with no sweep key', () => {
  it('writes the kernel default sweep', () => {
    const bare = structuredClone(tree);
    const fin = bare.components[0]!.children![1]!.children![0]!;
    delete fin['sweep'];
    const out = exportCdx1({ tree: bare, name: 'bare', launchMassKg: 0.45, launchCgM: 0.127 });
    expect(out).toContain(
      `<SweepDistance>${(KERNEL_DEFAULTS.trapezoidfinset.sweep * 39.37).toFixed(4).replace(/0+$/, '')}</SweepDistance>`,
    );
  });
});

/**
 * A dimension with no key is the one the kernel flies and every view draws
 * (KERNEL_DEFAULTS), not a figure of the RASAero writer's own.
 */
/**
 * A freeform outline is read as the kernel normalizes it (first point moved to
 * the origin), so a trapezoid the editor let start off the origin still exports.
 */
describe('a freeform trapezoid that starts off the origin', () => {
  it('writes the same fin as one at the origin', () => {
    const at = (x0: number, y0: number) => {
      const t = structuredClone(tree);
      const tube = t.components[0]!.children![1]!;
      tube.children![0] = {
        type: 'freeformfinset',
        id: 'fin',
        finCount: 3,
        thickness: 0.003,
        points: [
          [x0, y0],
          [x0 + 0.0254, y0 + 0.0254],
          [x0 + 0.0508, y0 + 0.0254],
          [x0 + 0.0508, y0],
        ],
        position: { method: 'bottom', offset: 0 },
      } as never;
      return exportCdx1({ tree: t, name: 'ff', launchMassKg: 0.45, launchCgM: 0.127 }).match(
        /<Fin>[\s\S]*?<\/Fin>/,
      )![0];
    };
    expect(at(0.02, 0.005)).toBe(at(0, 0));
  });
});

describe('parts with no dimension keys', () => {
  const inches = (m: number) => fmt(m * IN);
  const bare = structuredClone(tree);
  const [nose, tube] = bare.components[0]!.children!;
  delete nose!['length'];
  delete nose!['aftRadius'];
  delete tube!['length'];
  delete tube!['outerRadius'];
  const lug = tube!.children![1]!;
  delete lug['length'];
  delete lug['outerRadius'];
  const out = exportCdx1({ tree: bare, name: 'bare', launchMassKg: 0.45, launchCgM: 0.127 });
  const part = (tag: string) => out.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`))![0];

  it('writes the nose cone the kernel flies', () => {
    expect(part('NoseCone')).toContain(`<Length>${inches(KERNEL_DEFAULTS.nosecone.length)}</Length>`);
    expect(part('NoseCone')).toContain(`<Diameter>${inches(2 * KERNEL_DEFAULTS.nosecone.aftRadius)}</Diameter>`);
  });

  it('writes the body tube and its lug the kernel flies', () => {
    const body = part('BodyTube');
    expect(body).toContain(`<Diameter>${inches(2 * KERNEL_DEFAULTS.bodytube.outerRadius)}</Diameter>`);
    expect(body).toContain(
      `<LaunchLugDiameter>${inches(2 * KERNEL_DEFAULTS.launchlug.outerRadius)}</LaunchLugDiameter>`,
    );
    expect(body).toContain(`<LaunchLugLength>${inches(KERNEL_DEFAULTS.launchlug.length)}</LaunchLugLength>`);
  });

  it('places the fins against the length the tube is written with', () => {
    // A fin at the tube's top has its front edge one tube length above the
    // tube's bottom, which RASAero measures from.
    const topFin = structuredClone(bare);
    topFin.components[0]!.children![1]!.children![0]!.position = { method: 'top', offset: 0 };
    const xml = exportCdx1({ tree: topFin, name: 'bare', launchMassKg: 0.45, launchCgM: 0.127 });
    const fin = xml.match(/<Fin>[\s\S]*?<\/Fin>/)![0];
    expect(fin).toContain(`<Location>${inches(KERNEL_DEFAULTS.bodytube.length)}</Location>`);
  });
});

/**
 * The sustainer order rules the desktop's RocketDesignDTO enforces: a nose cone
 * first and nowhere else, never flipped, then a body tube or a closing
 * transition; a single-stage rocket's closing transition is a boat tail.
 */
describe('sustainer part order', () => {
  const nose = { type: 'nosecone', id: 'nc', name: 'Nose', length: 0.1, aftRadius: 0.0127, shape: 'ogive' };
  const tube = { type: 'bodytube', id: 'bt', name: 'Body', length: 0.254, outerRadius: 0.0127 };
  const tail = {
    type: 'transition',
    id: 'tr',
    name: 'Tail',
    length: 0.03,
    foreRadius: 0.0127,
    aftRadius: 0.009,
    shape: 'conical',
  };
  const one = (children: Record<string, unknown>[]): RocketTree =>
    ({ components: [{ type: 'stage', children }] }) as unknown as RocketTree;

  it('refuses a chain that does not start with a nose cone', () => {
    expect(() => exportCdx1({ tree: one([tube, nose]), name: 'x' })).toThrow(/start with a nose cone.*Body/);
  });

  it('refuses a second nose cone further down', () => {
    const tailCone = { ...nose, id: 'nc2', name: 'Tail cone' };
    expect(() => exportCdx1({ tree: one([nose, tube, tailCone]), name: 'x' })).toThrow(
      /only as the first part.*Tail cone/,
    );
  });

  it('refuses a flipped nose cone', () => {
    expect(() => exportCdx1({ tree: one([{ ...nose, flipped: true }, tube]), name: 'x' })).toThrow(
      /flipped nose cones.*Nose/,
    );
  });

  it('refuses a transition second unless it closes the chain', () => {
    expect(() => exportCdx1({ tree: one([nose, tail, tube]), name: 'x' })).toThrow(/right after the nose cone.*Tail/);
    expect(() => exportCdx1({ tree: one([nose, tail]), name: 'x' })).not.toThrow();
  });

  it("writes a single-stage rocket's closing transition as a boat tail", () => {
    const xml = exportCdx1({ tree: one([nose, tube, tail]), name: 'x' });
    expect(xml).toContain('<BoatTail>\n<PartType>BoatTail</PartType>');
    expect(xml).not.toContain('<Transition>');
  });

  it("writes a transition's <Diameter> from its aft radius, as desktop's BasePartDTO does", () => {
    const xml = exportCdx1({ tree: one([nose, tube, tail]), name: 'x' });
    const part = /<BoatTail>[\s\S]*?<\/BoatTail>/.exec(xml)![0];
    // aftRadius 0.009 m: 0.018 m across, 0.708661 in; the fore radius would be 1 in.
    expect(part).toContain('<Diameter>0.7087</Diameter>');
    expect(part).toContain('<RearDiameter>0.7087</RearDiameter>');
  });
});

/**
 * A booster is one RASAero body as long as all its tubes, and its fin Location
 * is measured from that body's bottom. Desktop's `BoosterDTO` adds the length of
 * every tube after the one the fins are on (`finLocationOffset`): fins with a
 * 2 in root flush with the bottom of the first of a 5 in and a 4 in tube sit
 * 2 + 4 = 6 in from the booster's bottom.
 */
describe('a booster made of two tubes', () => {
  const tube = (id: string, inches: number, children: unknown[] = []) => ({
    type: 'bodytube',
    id,
    name: id,
    length: inches * 0.0254,
    outerRadius: 0.0127,
    children,
  });
  const fins = {
    type: 'trapezoidfinset',
    id: 'bf',
    name: 'Booster fins',
    finCount: 3,
    rootChord: 0.0508,
    tipChord: 0.0254,
    sweep: 0.0254,
    height: 0.0254,
    thickness: 0.003,
    position: { method: 'bottom', offset: 0 },
  };
  const staged = (boosterTubes: unknown[]): RocketTree =>
    ({
      name: 'Two',
      components: [tree.components[0]!, { type: 'stage', id: 'b', name: 'Booster', children: boosterTubes }],
    }) as RocketTree;
  const boosterFinLocation = (t: RocketTree): number => {
    const out = exportCdx1({ tree: t, name: 'Two', launchMassKg: 0.5, launchCgM: 0.2 });
    const doc = new DOMParser().parseFromString(out, 'text/xml');
    return Number(doc.querySelector('Booster > Fin > Location')?.textContent);
  };

  it('measures the fin location from the bottom of the whole booster', () => {
    expect(boosterFinLocation(staged([tube('A', 5, [fins]), tube('B', 4)]))).toBeCloseTo(6, 3);
  });

  it('adds nothing when the fins are on the last tube', () => {
    expect(boosterFinLocation(staged([tube('A', 5), tube('B', 4, [fins])]))).toBeCloseTo(2, 3);
  });
});

/** The base design with one parachute in the body tube. */
const withChute = (chute: Record<string, unknown>): RocketTree => ({
  ...tree,
  components: [
    {
      ...tree.components[0]!,
      children: [
        tree.components[0]!.children![0]!,
        { ...tree.components[0]!.children![1]!, children: [{ type: 'parachute', id: 'p', name: 'Main', ...chute }] },
      ],
    },
  ],
});
const exported = (t: RocketTree, warnings?: Keyed[]) =>
  new DOMParser().parseFromString(
    exportCdx1({ tree: t, name: 'Chute', launchMassKg: 0.45, launchCgM: 0.12, warnings }),
    'text/xml',
  );
const recovery = (doc: Document, tag: string) => doc.querySelector(`Recovery > ${tag}`)?.textContent;

/**
 * RASAero has no ejection charge: desktop's RecoveryDTO writes a chute on it as
 * an apogee chute and warns (RASAeroExport.warning14). A key the part does not
 * carry is the kernel's default: a new parachute deploys on the ejection
 * charge, is 0.3 m across, and flies Parachute.DEFAULT_CD.
 */
describe('a parachute with no deployment or size of its own', () => {
  it('is written as the apogee device, with a warning naming it', () => {
    const warnings: Keyed[] = [];
    const doc = exported(withChute({}), warnings);
    expect(recovery(doc, 'EventType1')).toBe('Apogee');
    expect(recovery(doc, 'Event1')).toBe('True');
    expect(recovery(doc, 'Event2')).toBe('False');
    expect(Number(recovery(doc, 'Size1'))).toBeCloseTo(0.3 / 0.0254, 3);
    expect(Number(recovery(doc, 'CD1'))).toBe(0.8);
    expect(warnings).toEqual([{ key: 'errors.exportRasaeroChuteEjection', values: { name: 'Main' } }]);
  });

  // Any other event has no RASAero deployment (RASAeroExport.error21).
  it('is refused on an event RASAero has no deployment for, naming the part and the event', () => {
    expect(() => exported(withChute({ deployEvent: 'never' }))).toThrow(
      expect.objectContaining({
        key: 'errors.rasaero.chuteEvent',
        values: { name: 'Main', event: { key: 'deployEvent.never' } },
      }),
    );
  });
});

/**
 * Desktop's exporter reads every parachute anywhere in a stage
 * (RecoveryDTO.getParachutesFromRocket iterates the stage), and warns about a
 * streamer, which RASAero has no device for.
 */
describe('which parachutes are recovery', () => {
  const design = (noseKids: object[], tubeKids: object[]): RocketTree => ({
    ...tree,
    components: [
      {
        ...tree.components[0]!,
        children: [
          { ...tree.components[0]!.children![0]!, children: noseKids },
          { ...tree.components[0]!.children![1]!, children: tubeKids },
        ],
      } as RocketTree['components'][number],
    ],
  });

  it('reads one in the nose cone and one inside an inner tube in a body tube', () => {
    const doc = exported(
      design(
        [{ type: 'parachute', id: 'n', name: 'Nose chute', diameter: 0.6, deployEvent: 'apogee' }],
        [
          {
            type: 'innertube',
            id: 'it',
            length: 0.1,
            children: [
              { type: 'parachute', id: 'p', name: 'Main', diameter: 0.9, deployEvent: 'altitude', deployAltitude: 150 },
            ],
          },
        ],
      ),
    );
    expect(recovery(doc, 'Size1')).toBe(String(Number((0.6 / 0.0254).toFixed(3))));
    expect(recovery(doc, 'Size2')).toBe(String(Number((0.9 / 0.0254).toFixed(3))));
  });

  it('leaves out a streamer with a warning', () => {
    const warnings: Keyed[] = [];
    const doc = exported(design([], [{ type: 'streamer', id: 's', name: 'Ribbon' }]), warnings);
    expect(recovery(doc, 'DeviceType1')).toBe('None');
    expect(warnings).toEqual([{ key: 'errors.exportRasaeroStreamer', values: { name: 'Ribbon' } }]);
  });
});

/**
 * RASAero deploys device 1 at apogee and device 2 when descending through
 * Altitude2, whatever the event types say, so desktop's RecoveryDTO puts the
 * apogee chute in slot 1 and the altitude chute in slot 2 whatever their tree
 * order, each with its own CD, and leaves out a second chute on an event
 * already taken with a warning (RASAeroExport.warning15).
 */
describe('recovery slots', () => {
  const chutes = (...kids: object[]): RocketTree => ({
    ...tree,
    components: [
      {
        ...tree.components[0]!,
        children: [tree.components[0]!.children![0]!, { ...tree.components[0]!.children![1]!, children: kids }],
      } as RocketTree['components'][number],
    ],
  });
  const main = { type: 'parachute', id: 'm', name: 'Main', diameter: 1, cd: 1.5, deployEvent: 'altitude' };
  const drogue = { type: 'parachute', id: 'd', name: 'Drogue', diameter: 0.3, cd: 0.8, deployEvent: 'apogee' };

  it('writes the apogee chute first and the altitude chute second, as desktop does', () => {
    const warnings: Keyed[] = [];
    const doc = exported(chutes({ ...main, deployAltitude: 150 }, drogue), warnings);
    expect(recovery(doc, 'EventType1')).toBe('Apogee');
    expect(Number(recovery(doc, 'Size1'))).toBeCloseTo(0.3 * IN, 3);
    expect(recovery(doc, 'CD1')).toBe('0.8');
    expect(recovery(doc, 'Altitude1')).toBe('0');
    expect(recovery(doc, 'EventType2')).toBe('Altitude');
    expect(Number(recovery(doc, 'Altitude2'))).toBeCloseTo(150 * 3.28084, 3);
    expect(Number(recovery(doc, 'Size2'))).toBeCloseTo(1 * IN, 3);
    expect(recovery(doc, 'CD2')).toBe('1.5');
    expect(warnings).toEqual([]);
  });

  it('writes a lone altitude chute as device 2', () => {
    const doc = exported(chutes(main));
    expect(recovery(doc, 'Event1')).toBe('False');
    expect(recovery(doc, 'DeviceType1')).toBe('None');
    expect(recovery(doc, 'Event2')).toBe('True');
  });

  it('leaves out a second chute on an event already taken, with a warning', () => {
    const warnings: Keyed[] = [];
    const doc = exported(chutes(drogue, { ...drogue, id: 'd2', name: 'Spare', diameter: 0.5 }), warnings);
    expect(Number(recovery(doc, 'Size1'))).toBeCloseTo(0.3 * IN, 3);
    expect(recovery(doc, 'DeviceType2')).toBe('None');
    expect(warnings).toEqual([{ key: 'errors.exportRasaeroChuteExtra', values: { name: 'Spare' } }]);
  });
});

/**
 * RASAero has one ogive (tangent) and two Haack noses. Desktop
 * (RASAeroCommonConstants.OPENROCKET_TO_RASAERO_SHAPE) takes an ogive only at
 * shape parameter 1 and a Haack only at 0 (Von Karman) or within 1% of 1/3
 * (LV-Haack), and refuses the rest. An absent parameter is the shape's default.
 */
describe('the nose shape parameter', () => {
  const withNose = (nose: Record<string, unknown>): RocketTree => ({
    ...tree,
    components: [
      {
        ...tree.components[0]!,
        children: [{ ...tree.components[0]!.children![0]!, name: 'Nose', ...nose }, tree.components[0]!.children![1]!],
      },
    ],
  });
  const shapeOf = (nose: Record<string, unknown>) =>
    exported(withNose(nose)).querySelector('NoseCone > Shape')?.textContent;

  it.each([
    [{ shape: 'ogive' }, 'Tangent Ogive'],
    [{ shape: 'ogive', shapeParameter: 1 }, 'Tangent Ogive'],
    [{ shape: 'haack' }, 'Von Karman Ogive'],
    [{ shape: 'haack', shapeParameter: 0 }, 'Von Karman Ogive'],
    [{ shape: 'haack', shapeParameter: 0.333 }, 'LV-Haack'],
    // The kernel's own LV-Haack.
    [{ shape: 'haack', shapeParameter: 1 / 3 }, 'LV-Haack'],
  ])('writes %o as %s', (nose, expected) => {
    expect(shapeOf(nose)).toBe(expected);
  });

  it.each([
    [{ shape: 'ogive', shapeParameter: 0.5 }, 'errors.rasaero.noseOgiveParameter', 0.5],
    [{ shape: 'haack', shapeParameter: 0.2 }, 'errors.rasaero.noseHaackParameter', 0.2],
    [{ shape: 'haack', shapeParameter: 0.32 }, 'errors.rasaero.noseHaackParameter', 0.32],
  ])('refuses %o', (nose, key, value) => {
    expect(() => shapeOf(nose)).toThrow(expect.objectContaining({ key, values: { name: 'Nose', value } }));
  });
});

/**
 * A RASAero booster has a boat tail only on the last stage: desktop's
 * `BoosterDTO` writes a trailing transition as the boat tail when the stage is
 * the rocket's last child and otherwise raises error31 and error32 ("Boattails
 * can only be added to the last stage"), refusing the export. The same
 * transition on the last stage is the boat tail.
 */
describe('a trailing narrowing transition on a booster', () => {
  const booster = (id: string, trailing: boolean): unknown => ({
    type: 'stage',
    id,
    name: id,
    children: [
      { type: 'bodytube', id: `${id}t`, length: 0.2, outerRadius: 0.0127, children: [{ ...fins, id: `${id}f` }] },
      ...(trailing
        ? [{ type: 'transition', id: `${id}x`, length: 0.03, shape: 'conical', foreRadius: 0.0127, aftRadius: 0.008 }]
        : []),
    ],
  });
  const fins = {
    type: 'trapezoidfinset',
    finCount: 3,
    rootChord: 0.0508,
    tipChord: 0.0254,
    sweep: 0.0254,
    height: 0.0254,
    thickness: 0.003,
    position: { method: 'bottom', offset: 0 },
  };
  const three = (middle: boolean, last: boolean): RocketTree =>
    ({
      name: 'Three',
      components: [tree.components[0]!, booster('Middle', middle), booster('Last', last)],
    }) as RocketTree;
  const cells = [
    { massKg: 0.4, cgM: 0.15 },
    { massKg: 0.7, cgM: 0.3 },
    { massKg: 1, cgM: 0.45 },
  ];

  it('is refused on a stage that is not the last, naming the stage', () => {
    expect(() => exportCdx1({ tree: three(true, false), name: 'Three', stageLaunch: cells })).toThrow(
      expect.objectContaining({ key: 'errors.rasaero.boosterBoattail', values: { stage: 'Middle' } }),
    );
  });

  it('is the boat tail of the last stage', () => {
    const xml = exportCdx1({ tree: three(false, true), name: 'Three', stageLaunch: cells });
    const boosters = xml.match(/<Booster>[\s\S]*?<\/Booster>/g)!;
    expect(boosters).toHaveLength(2);
    expect(boosters[0]).toContain('<BoattailLength>0</BoattailLength>');
    // 0.03 m is 1.1811 in; 0.008 m aft radius is 0.63 in across.
    expect(boosters[1]).toContain('<BoattailLength>1.1811</BoattailLength>');
    expect(boosters[1]).toContain('<BoattailRearDiameter>0.6299</BoattailRearDiameter>');
  });
});

/**
 * Desktop's RASAeroCommonConstants.OPENROCKET_TO_RASAERO_MANUFACTURER, after
 * Manufacturer.getManufacturer resolves the name: "Loki" is a Loki Research
 * search name, so it takes the LR branch before the bare "Loki" one, and
 * "AMW ProX" is no Animal Motor Works alias, so it takes its own branch.
 */
describe('engine manufacturer abbreviations (desktop table)', () => {
  const stage = { type: 'stage', id: 's', children: [{ type: 'bodytube', id: 'mmt' }] } as never;
  const engine = (manufacturer: string) =>
    stageEngineSlots([stage], { mmt: { designation: 'J350W', manufacturer } }, true)[0]!.engine;

  it.each([
    ['Animal Motor Works', 'AMW'],
    ['AMW', 'AMW'],
    ['AMW ProX', 'AMW/ProX'],
    ['Loki', 'LR'],
    ['Loki Research', 'LR'],
    // RASAero's abbreviation for West Coast Hybrids, and the names desktop's
    // Manufacturer table gives it.
    ['West Coast Hybrids', 'WCH'],
    ['WCH', 'WCH'],
    ['West Coast', 'WCH'],
  ])('writes %s as %s', (manufacturer, abbrev) => {
    expect(engine(manufacturer)).toBe(`J350W  (${abbrev})`);
  });
});

/** RASAero writes and reads a CP element in the rocket design, not a CD one. */
it('writes the CP element RASAero reads, not CD', () => {
  const xml = exportCdx1({ tree, name: 'x' });
  expect(xml).toContain('<CP>0</CP>');
  expect(xml).not.toContain('<CD>0</CD>');
});

/**
 * RASAero has one trapezoidal fin set per part. Desktop's FinDTO writes any
 * other planar fin set as the trapezoid with the same root chord, span, area
 * and area centroid, and BodyTubeDTOAdapter keeps the first of several fin
 * sets, each with a warning.
 */
describe('fin sets RASAero has no form for', () => {
  // The single stage's cell, so the only warnings are the fins'.
  const cell = { launchMassKg: 0.45, launchCgM: 0.12 };
  const withFins = (...fins: object[]): RocketTree => ({
    ...tree,
    components: [
      {
        ...tree.components[0]!,
        children: [tree.components[0]!.children![0]!, { ...tree.components[0]!.children![1]!, children: fins }],
      } as RocketTree['components'][number],
    ],
  });
  const fin = (xml: string, tag: string) => Number(new RegExp(`<Fin>[\\s\\S]*?<${tag}>([^<]*)</${tag}>`).exec(xml)![1]);

  // Desktop's own case: for an ellipse it is the symmetric trapezoid with a
  // tip chord of (pi/2 - 1) times the root chord.
  it('writes an elliptical fin set as its equivalent trapezoid, with a warning', () => {
    const warnings: Keyed[] = [];
    const xml = exportCdx1({
      tree: withFins({ type: 'ellipticalfinset', id: 'e', name: 'Ellipse', finCount: 3, rootChord: 0.1, height: 0.05 }),
      name: 'x',
      warnings,
      ...cell,
    });
    const root = 0.1 * IN;
    const tip = (Math.PI / 2 - 1) * root;
    expect(fin(xml, 'Chord')).toBeCloseTo(root, 3);
    expect(fin(xml, 'Span')).toBeCloseTo(0.05 * IN, 3);
    expect(Math.abs(fin(xml, 'TipChord') - tip)).toBeLessThan(0.01 * tip);
    expect(Math.abs(fin(xml, 'SweepDistance') - (root - tip) / 2)).toBeLessThan(0.01 * root);
    expect(warnings).toEqual([{ key: 'errors.exportRasaeroFinShape', values: { name: 'Ellipse' } }]);
  });

  it('writes a freeform fin set with the same area and centroid as its outline', () => {
    // An L: 0.1 m root, 0.05 m span, with the outline stepping down to 0.02 m
    // halfway back. Its area is 0.05 * 0.05 + 0.05 * 0.02 = 0.0035 m^2.
    const warnings: Keyed[] = [];
    const xml = exportCdx1({
      tree: withFins({
        type: 'freeformfinset',
        id: 'f',
        name: 'Step',
        finCount: 4,
        points: [
          [0, 0],
          [0, 0.05],
          [0.05, 0.05],
          [0.05, 0.02],
          [0.1, 0.02],
          [0.1, 0],
        ],
      }),
      name: 'x',
      warnings,
      ...cell,
    });
    const root = fin(xml, 'Chord') / IN;
    const span = fin(xml, 'Span') / IN;
    const tip = fin(xml, 'TipChord') / IN;
    const sweep = fin(xml, 'SweepDistance') / IN;
    expect(root).toBeCloseTo(0.1, 4);
    expect(span).toBeCloseTo(0.05, 4);
    expect(((root + tip) / 2) * span).toBeCloseTo(0.0035, 5);
    // The L's centroid is (0.025 * 0.0025 + 0.075 * 0.001) / 0.0035 from the root's front.
    const centroid = (sweep * (root + 2 * tip) + root * root + root * tip + tip * tip) / (3 * (root + tip));
    expect(centroid).toBeCloseTo((0.025 * 0.0025 + 0.075 * 0.001) / 0.0035, 4);
    expect(warnings).toEqual([{ key: 'errors.exportRasaeroFinShape', values: { name: 'Step' } }]);
  });

  it('keeps the first of two fin sets on a tube, with a warning naming the other', () => {
    const warnings: Keyed[] = [];
    const first = tree.components[0]!.children![1]!.children![0]!;
    const second = { ...first, id: 'fin2', name: 'Canards', finCount: 4 };
    const xml = exportCdx1({ tree: withFins({ ...first, name: 'Main fins' }, second), name: 'x', warnings, ...cell });
    expect(xml.match(/<Fin>/g)).toHaveLength(1);
    expect(fin(xml, 'Count')).toBe(3);
    expect(warnings).toEqual([
      { key: 'errors.exportRasaeroExtraFins', values: { name: 'Canards', part: { key: 'part.bodytube' } } },
    ]);
  });

  it('still refuses tube fins, which have no planform', () => {
    expect(() => exportCdx1({ tree: withFins({ type: 'tubefinset', id: 't', name: 'Tubes' }), name: 'x' })).toThrow(
      expect.objectContaining({ key: 'errors.rasaero.tubeFinsUnsupported', values: { name: 'Tubes' } }),
    );
  });

  it('keeps the first fin set of a booster body and warns about one elsewhere in the stage', () => {
    const warnings: Keyed[] = [];
    const finSet = (id: string, name: string) => ({ ...tree.components[0]!.children![1]!.children![0]!, id, name });
    const two: RocketTree = {
      name: 'Two',
      components: [
        tree.components[0]!,
        {
          type: 'stage',
          id: 'b',
          name: 'Booster',
          children: [
            {
              type: 'bodytube',
              id: 't1',
              name: 'Upper',
              length: 0.1,
              outerRadius: 0.0127,
              children: [finSet('f1', 'Low')],
            },
            {
              type: 'bodytube',
              id: 't2',
              name: 'Lower',
              length: 0.1,
              outerRadius: 0.0127,
              children: [finSet('f2', 'Aft')],
            },
          ],
        },
      ],
    };
    const xml = exportCdx1({ tree: two, name: 'Two', stageLaunch: [], warnings });
    expect(xml.match(/<Booster>[\s\S]*?<\/Booster>/)![0].match(/<Fin>/g)).toHaveLength(1);
    expect(warnings).toContainEqual({ key: 'errors.exportRasaeroExtraFins', values: { name: 'Aft', part: 'Lower' } });
  });
});

/**
 * RASAero gives every body tube the aft diameter of the part ahead of it once
 * it loads a design, so desktop's BodyTubeDTO refuses a tube of another
 * diameter (RASAeroExport.error15) rather than have RASAero resize it.
 */
describe('a body tube diameter step', () => {
  const stepped = (noseRadius: number): RocketTree => ({
    ...tree,
    components: [
      {
        ...tree.components[0]!,
        children: [
          { ...tree.components[0]!.children![0]!, name: 'Nose', aftRadius: noseRadius },
          { ...tree.components[0]!.children![1]!, name: 'Body' },
        ],
      } as RocketTree['components'][number],
    ],
  });

  it('is refused, naming the tube and the part ahead of it', () => {
    expect(() => exportCdx1({ tree: stepped(0.0127 - 0.001), name: 'x' })).toThrow(
      expect.objectContaining({ key: 'errors.rasaero.tubeStep', values: { name: 'Body', previous: 'Nose' } }),
    );
  });

  it('is not raised when the tube meets the part ahead of it', () => {
    expect(() => exportCdx1({ tree: stepped(0.0127), name: 'x' })).not.toThrow();
  });
});

/**
 * Desktop's LaunchSiteDTO writes the simulated launch site: RASAero's
 * barometric pressure is the pressure reduced to sea level, 0 for the
 * standard atmosphere, in which case RASAero uses the standard pressure at the
 * site; the temperature is the one the flight starts in; and the wind is the
 * signed headwind component along the rod.
 */
describe('the launch site', () => {
  const site = (launch: Partial<LaunchConditions>, warnings?: Keyed[]) => {
    const doc = new DOMParser().parseFromString(
      exportCdx1({ tree, name: 'x', launch, warnings, launchMassKg: 0.45, launchCgM: 0.12 }),
      'text/xml',
    );
    return (tag: string) => Number(doc.querySelector(`LaunchSite > ${tag}`)?.textContent);
  };
  // RASAero II's standard atmosphere, as desktop's
  // RASAERO_TO_OPENROCKET_LAUNCH_PRESSURE turns its input back into the
  // site's pressure (Pa).
  const sitePressure = (barometric: number, altitudeFt: number) => {
    const pressureAltitude = altitudeFt + (Math.pow((barometric * 0.49117) / 14.6958, 0.19026) - 1) / -6.87535e-6;
    return 14.6958 * Math.pow(1 - 6.87535e-6 * pressureAltitude, 5.2561) * 6894.757;
  };

  it('writes a typed pressure reduced to sea level, which RASAero turns back into it', () => {
    const at = site({ launchAltitudeM: 1000, temperatureC: 26.85, pressureHPa: 880 });
    expect(sitePressure(at('Pressure'), 1000 * 3.28084)).toBeCloseTo(88000, -1);
    // Reduced to sea level, it is above the site's 25.99 in-Hg.
    expect(at('Pressure')).toBeGreaterThan(880 / 33.8639);
    expect(at('Temperature')).toBeCloseTo(80.33, 1);
  });

  it('writes no pressure and the standard temperature at the site for the standard atmosphere', () => {
    const at = site({ launchAltitudeM: 1000, temperatureC: null, pressureHPa: null });
    expect(at('Pressure')).toBe(0);
    // 288.15 K less 6.5 K a kilometer, in degrees Fahrenheit.
    expect(at('Temperature')).toBeCloseTo((288.15 - 6.5 - 273.15) * 1.8 + 32, 0);
  });

  it('writes the headwind along the rod, negative for a tailwind', () => {
    const wind = { windAverage: 5, windDirectionDeg: 90, launchAltitudeM: 0 };
    expect(site({ ...wind, launchRodDirectionDeg: 90 })('WindSpeed')).toBeCloseTo(5 * 2.23694, 3);
    expect(site({ ...wind, launchRodDirectionDeg: 270 })('WindSpeed')).toBeCloseTo(-5 * 2.23694, 3);
    expect(site({ ...wind, launchRodDirectionDeg: 0 })('WindSpeed')).toBeCloseTo(0, 3);
    // Launched into the wind, the rod is turned to face it.
    expect(site({ ...wind, launchRodDirectionDeg: 270, launchIntoWind: true })('WindSpeed')).toBeCloseTo(
      5 * 2.23694,
      3,
    );
  });

  it("writes a wind profile's lowest level, with a warning", () => {
    const warnings: Keyed[] = [];
    const at = site(
      {
        launchAltitudeM: 0,
        launchRodDirectionDeg: 90,
        windLevels: [
          { altitudeM: 500, speed: 9, directionDeg: 90, stddev: 0 },
          { altitudeM: 100, speed: 4, directionDeg: 90, stddev: 0 },
        ],
      },
      warnings,
    );
    expect(at('WindSpeed')).toBeCloseTo(4 * 2.23694, 3);
    expect(warnings).toEqual([{ key: 'errors.exportRasaeroWindLevels' }]);
  });
});

/**
 * Desktop's SimulationDTO converts the staging events to RASAero's timeline,
 * which runs from each booster's burnout: the booster's separation delay is
 * how long the two stages coast together, and the upper stage's ignition
 * delay how long it then coasts alone. A booster is included only when the
 * configuration flies it and it has a motor, and a stage's other motors are
 * named in a warning, since RASAero flies one motor per stage.
 */
describe('staging, nozzles and the motors RASAero flies', () => {
  const finSet = { ...tree.components[0]!.children![1]!.children![0]!, id: 'bf' };
  const staged = (
    booster: object = {},
    mounts: object[] = [{ type: 'innertube', id: 'bm', length: 0.1 }],
  ): RocketTree => ({
    name: 'Two',
    components: [
      {
        ...tree.components[0]!,
        id: 'sus',
        name: 'Sustainer',
        children: [
          tree.components[0]!.children![0]!,
          {
            ...tree.components[0]!.children![1]!,
            children: [...tree.components[0]!.children![1]!.children!, { type: 'innertube', id: 'sm', length: 0.1 }],
          },
        ],
      },
      {
        type: 'stage',
        id: 'b',
        name: 'Booster',
        ...booster,
        children: [{ type: 'bodytube', id: 'bt', length: 0.2, outerRadius: 0.0127, children: [finSet, ...mounts] }],
      },
    ] as RocketTree['components'],
  });
  const motor = (o: Partial<Cdx1ExportEngine> = {}): Cdx1ExportEngine => ({
    designation: 'J350W',
    manufacturer: 'AeroTech',
    ...o,
  });
  const run = (t: RocketTree, motors: Record<string, Cdx1ExportEngine>, extra: object = {}) => {
    const warnings: Keyed[] = [];
    const xml = exportCdx1({ tree: t, name: 'Two', stageLaunch: [], motors, warnings, ...extra });
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const cell = (tag: string) => doc.querySelector(`Simulation > ${tag}`)?.textContent;
    return { xml, doc, cell, warnings: warnings.filter((k) => k.key !== 'errors.exportRasaeroStageMass') };
  };

  it("separates on the booster's ejection charge after its motor's delay", () => {
    // The kernel's default separation: the booster's ejection charge.
    const { cell, warnings } = run(staged({ separationDelay: 0.5 }), {
      sm: motor({ ignitionEvent: 'ejectioncharge', ignitionDelay: 1 }),
      bm: motor({ delay: 4 }),
    });
    expect(cell('Booster1SeparationDelay')).toBe('4.5');
    // Ignited 4 + 1 s after burnout, 0.5 s after separation.
    expect(cell('SustainerIgnitionDelay')).toBe('0.5');
    expect(cell('IncludeBooster1')).toBe('True');
    expect(warnings).toEqual([]);
  });

  it('ignites the upper stage at separation on the next-stage-ignition event', () => {
    const { cell } = run(staged({ separationEvent: 'upperignition' }), {
      sm: motor({ ignitionEvent: 'burnout', ignitionDelay: 2 }),
      bm: motor({ delay: 6 }),
    });
    expect(cell('Booster1SeparationDelay')).toBe('2');
    expect(cell('SustainerIgnitionDelay')).toBe('0');
  });

  it('warns about events the timeline has no place for, and stages them at burnout', () => {
    const { cell, warnings } = run(staged({ separationEvent: 'apogee', separationDelay: 1 }), {
      sm: motor({ ignitionEvent: 'launch', ignitionDelay: 0.25 }),
      bm: motor({ delay: 6 }),
    });
    expect(cell('Booster1SeparationDelay')).toBe('1');
    expect(cell('SustainerIgnitionDelay')).toBe('0');
    expect(warnings).toEqual([
      {
        key: 'errors.exportRasaeroIgnitionEvent',
        values: { stage: 'Sustainer', event: { key: 'ignition.launch' } },
      },
      {
        key: 'errors.exportRasaeroSeparationEvent',
        values: { stage: 'Booster', event: { key: 'separationEvent.apogee' } },
      },
      { key: 'errors.exportRasaeroIgnitionBeforeSeparation', values: { stage: 'Sustainer' } },
    ]);
  });

  it('does not separate a plugged booster on its ejection charge', () => {
    const { cell, warnings } = run(staged(), {
      sm: motor({ ignitionEvent: 'burnout' }),
      bm: motor({ delay: PLUGGED_DELAY }),
    });
    expect(cell('Booster1SeparationDelay')).toBe('0');
    expect(warnings).toContainEqual({
      key: 'errors.exportRasaeroSeparationEvent',
      values: { stage: 'Booster', event: { key: 'separationEvent.ejection' } },
    });
  });

  it('leaves out a booster the configuration grounds', () => {
    const { cell } = run(staged(), { sm: motor(), bm: motor({ delay: 3 }) }, { grounded: ['b'] });
    expect(cell('IncludeBooster1')).toBe('False');
    expect(cell('Booster1SeparationDelay')).toBe('0');
  });

  it('writes a cluster as one nozzle of the same exit area, and warns that one motor flies', () => {
    const { xml, cell, warnings } = run(
      staged({ nozzleExitDiameter: 0.0254 }, [{ type: 'innertube', id: 'bm', length: 0.1, cluster: '4-ring' }]),
      { sm: motor(), bm: motor({ delay: 3 }) },
    );
    // Four 1 in nozzles have the area of one 2 in nozzle.
    expect(cell('Booster1NozzleDiameter')).toBe('2');
    expect(xml).toContain('<Booster1Nozzle>2</Booster1Nozzle>');
    expect(xml).toContain('<NozzleExitDiameter>2</NozzleExitDiameter>');
    expect(xml).toContain('<NozzleDiameter>2</NozzleDiameter>');
    expect(cell('SustainerNozzleDiameter')).toBe('0');
    expect(warnings).toEqual([{ key: 'errors.exportRasaeroExtraMotors', values: { stage: 'Booster' } }]);
  });

  it('warns about a motor in a second mount of a stage', () => {
    const { warnings } = run(
      staged({}, [
        { type: 'innertube', id: 'bm', length: 0.1 },
        { type: 'innertube', id: 'bm2', length: 0.1 },
      ]),
      { sm: motor(), bm: motor({ delay: 3 }), bm2: motor({ delay: 3 }) },
    );
    expect(warnings).toEqual([{ key: 'errors.exportRasaeroExtraMotors', values: { stage: 'Booster' } }]);
  });
});
