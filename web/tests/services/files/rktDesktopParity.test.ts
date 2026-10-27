// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { importRkt } from '../../../src/services/files/rktImport';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';
import { noteTexts } from '../../testing/importNotes';
import { wireLoadedOrk } from '../../../src/services/files/wireLoadedOrk';
import type { LoadedOrk } from '../../../src/services/files/loadOrk';
import type { LaunchConditions } from '../../../src/services/design/orkTree';

/**
 * Where our `.rkt` reader has to agree with OpenRocket's own, field by field.
 *
 * Each case below names the desktop handler it is copied from, because the
 * handlers are the specification and several of them do something the file
 * format alone does not hint at: a zero ID means solid, a bulk density on a
 * parachute has to be multiplied by the fabric thickness, a mass object's stated
 * CG has to be thrown away, and a detachable pod is a booster.
 *
 * `rktImport.test.ts` covers the ordinary reading of a whole design. This file
 * is one design per rule, so a failure names the rule.
 */

const doc = (stage3: string, design = ''): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<RockSimDocument>
  <DesignInformation>
    <RocketDesign>
      <Name>Parity</Name>
      <StageCount>1</StageCount>
      ${design}
      <Stage3Parts>${stage3}</Stage3Parts>
    </RocketDesign>
  </DesignInformation>
</RockSimDocument>`;

const find = (nodes: ComponentNode[] | undefined, name: string): ComponentNode => {
  for (const n of nodes ?? []) {
    if (n.name === name) return n;
    const hit = (() => {
      try {
        return find(n.children, name);
      } catch {
        return undefined;
      }
    })();
    if (hit) return hit;
  }
  throw new Error(`no component named ${name}`);
};

const read = (stage3: string, design = ''): ComponentNode[] => importRkt(doc(stage3, design)).tree.components;
const parts = (stage3: string, design = ''): ComponentNode[] => read(stage3, design)[0]!.children ?? [];

describe('a zero ID is solid, not missing', () => {
  /**
   * `BodyTube.setInnerRadius(r)` is `setThickness(getOuterRadius() - r)`, and
   * every handler calls it unconditionally, so `<ID>0</ID>` means a solid part.
   * Treating it as absent would leave the bridge's default 2 mm wall on a solid rod.
   */
  it('gives a tube with no bore a wall equal to its own radius', () => {
    const tube = find(parts('<BodyTube><Name>Rod</Name><Len>100</Len><OD>20</OD><ID>0</ID></BodyTube>'), 'Rod');
    expect(tube['outerRadius']).toBeCloseTo(0.01, 12);
    expect(tube['thickness']).toBeCloseTo(0.01, 12);
  });

  it('does the same for a coupler and an engine block', () => {
    const rkt = `<BodyTube><Name>Air</Name><Len>100</Len><OD>24</OD><ID>23</ID><AttachedParts>
      <Ring><Name>Coupler</Name><UsageCode>4</UsageCode><Len>20</Len><OD>23</OD><ID>0</ID></Ring>
      <Ring><Name>Block</Name><UsageCode>2</UsageCode><Len>5</Len><OD>18</OD><ID>0</ID></Ring>
    </AttachedParts></BodyTube>`;
    const list = parts(rkt);
    expect(find(list, 'Coupler')['thickness']).toBeCloseTo(0.0115, 12);
    expect(find(list, 'Block')['thickness']).toBeCloseTo(0.009, 12);
  });

  it('still leaves an ABSENT ID to the app default, which is not the same thing', () => {
    const tube = find(parts('<BodyTube><Name>Rod</Name><Len>100</Len><OD>20</OD></BodyTube>'), 'Rod');
    expect(tube['thickness']).toBeUndefined();
  });
});

describe('a ring with a bore and no outer diameter', () => {
  /**
   * `RingHandler` builds every ring as a detached CenteringRing, whose
   * `setInnerRadius` raises a stored outer radius of 0 to the bore and turns
   * Automatic off; `copyValues` hands that radius on. Desktop 24.12 opens both
   * of these at a 30 mm outer radius in a 39 mm bore.
   */
  const ring = (usage: number): ComponentNode =>
    find(
      parts(
        `<BodyTube><Name>B</Name><Len>300</Len><OD>80</OD><ID>78</ID><AttachedParts>
        <Ring><Name>R</Name><UsageCode>${usage}</UsageCode><Len>5</Len><ID>60</ID></Ring>
        </AttachedParts></BodyTube>`,
      ),
      'R',
    );

  it('is a centering ring with no wall', () => {
    const r = ring(0);
    expect(r['outerRadius']).toBeCloseTo(0.03, 12);
    expect(r['innerRadius']).toBeCloseTo(0.03, 12);
  });

  it('is a bulkhead the size of the bore', () => {
    expect(ring(1)['outerRadius']).toBeCloseTo(0.03, 12);
  });
});

describe('a recovery device fabric', () => {
  const chute = (density: string, type: string, thickness = '<Thickness>0.05</Thickness>'): ComponentNode =>
    find(
      parts(
        `<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID><AttachedParts>
        <Parachute><Name>C</Name><Dia>400</Dia><Density>${density}</Density>
        <DensityType>${type}</DensityType>${thickness}<Material>Fabric</Material></Parachute>
      </AttachedParts></BodyTube>`,
      ),
      'C',
    );

  /**
   * The direction the kernel converts in. `BaseHandler.computeDensity` is
   * `raw / type.asOpenRocket()` and the surface constant is 1/10, so inbound is
   * x10; `BasePartDTO` multiplies by the same 1/10 on the way out. The two are
   * one factor used in opposite directions, and having them the wrong way round
   * is a hundredfold error that still reads as a plausible density.
   */
  it('converts a SURFACE density by multiplying by ten', () => {
    expect(chute('0.0067', '1')['surfaceDensity']).toBeCloseTo(0.067, 12);
  });

  /**
   * `RecoveryDeviceHandler.computeDensity`: a bulk density is per volume, so it
   * only becomes per area once multiplied by the fabric's own thickness. Without
   * it a kg/m3 number would sit in a kg/m2 field.
   */
  it('turns a BULK density into a surface one with the fabric thickness', () => {
    // 1390 kg/m3 of 0.05 mm mylar is 0.0695 kg/m2.
    expect(chute('1390', '0')['surfaceDensity']).toBeCloseTo(0.0695, 12);
  });

  /** RockSim ignores the thickness for LINE and treats it as a surface density. */
  it('treats a LINE density as a surface one', () => {
    expect(chute('0.0067', '2')['surfaceDensity']).toBeCloseTo(0.067, 12);
  });

  /**
   * A zero density is a RockSim bug on these two parts, and the handler falls
   * back to its own computed mass over the canopy area.
   */
  it('falls back to CalcMass over the area when the density is zero', () => {
    const c = find(
      parts(
        `<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID><AttachedParts>
        <Parachute><Name>C</Name><Dia>400</Dia><Density>0</Density><DensityType>1</DensityType>
        <CalcMass>8.4</CalcMass></Parachute></AttachedParts></BodyTube>`,
      ),
      'C',
    );
    // 8.4 g over pi * 0.2^2 m2.
    expect(c['surfaceDensity']).toBeCloseTo(0.0084 / (Math.PI * 0.04), 12);
  });

  it('never leaves the fabric on the bulk keys, where it would be read as a solid', () => {
    const c = chute('0.0067', '1');
    expect(c.density).toBeUndefined();
    expect(c['materialName']).toBeUndefined();
    expect(c['surfaceMaterialName']).toBe('Fabric');
  });

  /**
   * `ParachuteHandler`: RockSim has no packed size, so desktop approximates one
   * from the tube the chute sits in, for both the radius and the length. The
   * kernel's own default is 12.5 mm whatever tube it is in.
   */
  it('packs into nine tenths of its parent body tube', () => {
    const c = chute('0.0067', '1');
    expect(c['radius']).toBeCloseTo(0.012 * 0.9, 12);
    expect(c['length']).toBeCloseTo(0.012 * 0.9, 12);
  });

  it('falls back to a fortieth of the canopy when the parent is not a tube', () => {
    const c = find(
      parts(
        '<Transition><Name>T</Name><Len>50</Len><FrontDia>10</FrontDia><RearDia>24</RearDia><AttachedParts><Parachute><Name>C</Name><Dia>400</Dia></Parachute></AttachedParts></Transition>',
      ),
      'C',
    );
    expect(c['radius']).toBeCloseTo(0.4 * 0.025, 12);
  });
});

describe('a fin set', () => {
  const fin = (
    extra: string,
    parent = '<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID>',
  ): ComponentNode =>
    find(
      parts(
        `${parent}<AttachedParts><FinSet><Name>F</Name><ShapeCode>0</ShapeCode><FinCount>3</FinCount>
        <RootChord>60</RootChord><TipChord>30</TipChord><SemiSpan>45</SemiSpan><SweepDistance>25</SweepDistance>
        <Thickness>3</Thickness>${extra}</FinSet></AttachedParts>${parent.startsWith('<BodyTube') ? '</BodyTube>' : '</Transition>'}`,
      ),
      'F',
    );

  /** `FinSetHandler.convertTipShapeCode`: 0 square, 1 rounded, 2 airfoil. */
  it('reads the cross section from TipShapeCode', () => {
    expect(fin('<TipShapeCode>1</TipShapeCode>')['crossSection']).toBe('rounded');
    expect(fin('<TipShapeCode>2</TipShapeCode>')['crossSection']).toBe('airfoil');
  });

  it('leaves a square cross section unstated, since that is the default', () => {
    expect(fin('<TipShapeCode>0</TipShapeCode>')['crossSection']).toBeUndefined();
    expect(fin('')['crossSection']).toBeUndefined();
  });

  /**
   * `FinSetHandler.endHandler` overrides an airfoil fin's mass and CG with
   * RockSim's own computed pair even though the file asked for no override,
   * because RockSim computes one mass per fin whatever the cross section.
   */
  it('takes RockSim computed mass and CG for an airfoil fin', () => {
    const f = fin('<TipShapeCode>2</TipShapeCode><CalcMass>4.5</CalcMass><CalcCG>28</CalcCG>');
    expect(f['overrideMass']).toBeCloseTo(0.0045, 12);
    expect(f['overrideCGX']).toBeCloseTo(0.028, 12);
  });

  it('leaves a square fin to its own material', () => {
    const f = fin('<CalcMass>4.5</CalcMass><CalcCG>28</CalcCG>');
    expect(f['overrideMass']).toBeUndefined();
  });

  it('does not overrule an override the file states for itself', () => {
    const f = fin(
      '<TipShapeCode>2</TipShapeCode><CalcMass>4.5</CalcMass><UseKnownCG>1</UseKnownCG><KnownMass>9</KnownMass>',
    );
    expect(f['overrideMass']).toBeCloseTo(0.009, 12);
  });

  /**
   * A tab is measured from the front of the fin root, so on a tapering body its
   * stated depth already contains the radius drop along the tab:
   * `setTabHeight(tabDepth - max(front - trailing, 0))`, where `front` and
   * `trailing` are `getParentFrontRadius` / `getParentTrailingRadius`, read
   * before the fin is attached, so at the tab's own offset and end from the
   * parent's fore end.
   */
  it('gives back the taper a tab depth already contains', () => {
    const onTube = fin('<TabLength>40</TabLength><TabDepth>5</TabDepth>');
    expect(onTube['tabHeight']).toBeCloseTo(0.005, 12);
    // A 30 mm freeform fin standing 40 mm down a 60 mm conical transition,
    // 24 mm to 18 mm, with a 30 mm tab from the root's front. Desktop 24.12
    // opens this with a tab height of 3.5 mm: the radius drops from 12 mm at
    // 0 mm to 10.5 mm at 30 mm. Neither the whole taper (3 mm) nor the drop
    // under where the fin stands (1 mm) is what it reads.
    const onTransition = find(
      parts(
        `<NoseCone><Name>N</Name><Len>100</Len><BaseDia>24</BaseDia></NoseCone>
        <Transition><Name>T</Name><Len>60</Len><FrontDia>24</FrontDia><RearDia>18</RearDia><ShapeCode>0</ShapeCode><AttachedParts>
        <FinSet><Name>F</Name><ShapeCode>2</ShapeCode><FinCount>3</FinCount><Xb>40</Xb><LocationMode>0</LocationMode>
        <PointList>30,0|20,30|0,30|0,0</PointList><Thickness>3</Thickness>
        <TabLength>30</TabLength><TabDepth>5</TabDepth><TabOffset>0</TabOffset></FinSet>
        </AttachedParts></Transition>`,
      ),
      'F',
    );
    expect(onTransition['tabHeight']).toBeCloseTo(0.0035, 12);
  });
});

describe('a shoulder', () => {
  /**
   * `NoseConeHandler.endHandler` / `TransitionHandler.endHandler`: a filled part
   * has a solid shoulder, so its thickness is its own radius; a hollow one hands
   * the shoulder its wall.
   */
  it('on a hollow part carries that part wall', () => {
    const n = find(
      parts(
        '<NoseCone><Name>N</Name><Len>100</Len><BaseDia>24</BaseDia><ConstructionType>1</ConstructionType><WallThickness>1.5</WallThickness><ShoulderOD>23</ShoulderOD><ShoulderLen>20</ShoulderLen></NoseCone>',
      ),
      'N',
    );
    expect(n['shoulderThickness']).toBeCloseTo(0.0015, 12);
  });

  it('on a filled part is solid, which is a thickness equal to its radius', () => {
    const n = find(
      parts(
        '<NoseCone><Name>N</Name><Len>100</Len><BaseDia>24</BaseDia><ConstructionType>0</ConstructionType><ShoulderOD>23</ShoulderOD><ShoulderLen>20</ShoulderLen></NoseCone>',
      ),
      'N',
    );
    expect(n['filled']).toBe(true);
    expect(n['shoulderThickness']).toBeCloseTo(0.0115, 12);
  });

  it('is set per side on a transition', () => {
    const t = find(
      parts(
        '<Transition><Name>T</Name><Len>50</Len><FrontDia>18</FrontDia><RearDia>24</RearDia><ConstructionType>1</ConstructionType><WallThickness>1.2</WallThickness><FrontShoulderDia>17</FrontShoulderDia><FrontShoulderLen>15</FrontShoulderLen><RearShoulderDia>23</RearShoulderDia><RearShoulderLen>18</RearShoulderLen></Transition>',
      ),
      'T',
    );
    expect(t['foreShoulderThickness']).toBeCloseTo(0.0012, 12);
    expect(t['aftShoulderThickness']).toBeCloseTo(0.0012, 12);
  });
});

describe('a mass object', () => {
  const inTube = (body: string): ComponentNode[] =>
    parts(
      `<BodyTube><Name>Air</Name><Len>100</Len><OD>24</OD><ID>23</ID><AttachedParts>${body}</AttachedParts></BodyTube>`,
    );

  /**
   * `MassObjectHandler`: RockSim measures a mass object's CG from the front of
   * its parent, and that is already carried in the object's position, so keeping
   * it as a CG override counts it twice. Desktop zeroes it for this reason.
   */
  it('zeroes the CG override RockSim states, because the position already has it', () => {
    const m = find(
      inTube(
        '<MassObject><Name>M</Name><TypeCode>0</TypeCode><Len>50</Len><KnownMass>22</KnownMass><KnownCG>25</KnownCG><UseKnownCG>1</UseKnownCG></MassObject>',
      ),
      'M',
    );
    expect(m['mass']).toBeCloseTo(0.022, 12);
    expect(m['overrideCGX']).toBe(0);
  });

  /**
   * `inferAsShockCord`: the type code says so, or the object is at least twice
   * its parent's length and made of a line material. Its comment says the type
   * code usually does not say so, because of bugs in RockSim's own databases.
   */
  it('is a shock cord when it is long and made of line, whatever the type code says', () => {
    const c = find(
      inTube(
        '<MassObject><Name>Cord</Name><TypeCode>0</TypeCode><Len>1000</Len><KnownMass>6</KnownMass><Density>0.006</Density><DensityType>2</DensityType></MassObject>',
      ),
      'Cord',
    );
    expect(c.type).toBe('shockcord');
    expect(c['cordLength']).toBeCloseTo(1, 12);
    expect(c['lineDensity']).toBeCloseTo(0.006, 12);
  });

  it('is a mass component when it is long but not made of line', () => {
    const m = find(
      inTube(
        '<MassObject><Name>Slug</Name><TypeCode>0</TypeCode><Len>1000</Len><KnownMass>6</KnownMass><Density>2700</Density><DensityType>0</DensityType></MassObject>',
      ),
      'Slug',
    );
    expect(m.type).toBe('masscomponent');
  });

  /** `MASS_LEN_FUDGE_FACTOR`: RockSim states one length, OpenRocket wants two. */
  it('packs a cord to a hundredth of its real length, inside its parent bore', () => {
    const c = find(
      inTube('<MassObject><Name>Cord</Name><TypeCode>1</TypeCode><Len>1000</Len><KnownMass>6</KnownMass></MassObject>'),
      'Cord',
    );
    expect(c['cordLength']).toBeCloseTo(1, 12);
    expect(c['length']).toBeCloseTo(0.01, 12);
    // 24 mm across with a 0.5 mm wall leaves an 11.5 mm bore.
    expect(c['radius']).toBeCloseTo(0.0115, 12);
  });
});

describe('a pod', () => {
  // On a body tube: a stage's own parts are only nose cones, body tubes and
  // transitions (StageHandler), so a pod rides in a tube's attached parts.
  const pod = (extra: string): ComponentNode[] =>
    parts(
      `<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID><AttachedParts>
      <ExternalPod><Name>P</Name><RadialLoc>30</RadialLoc><RadialAngle>90</RadialAngle>${extra}
      <AttachedParts><BodyTube><Name>Pod tube</Name><Len>100</Len><OD>18</OD><ID>17</ID>
      <AttachedParts><LaunchLug><Name>Pod lug</Name><Len>20</Len><OD>5</OD><ID>4</ID><RadialAngle>120</RadialAngle></LaunchLug></AttachedParts>
      </BodyTube></AttachedParts></ExternalPod></AttachedParts></BodyTube>`,
    );

  /**
   * `PodHandler.endHandler`: a detachable or ejected RockSim pod flies its own
   * branch, so desktop moves its children into a ParallelStage and drops the
   * podset. A ParallelStage is an AxialStage for us too.
   */
  it('that separates is a parallel stage, not a fixed pod', () => {
    expect(find(pod('<Detachable>1</Detachable>'), 'P').type).toBe('parallelstage');
    expect(find(pod('<Removed>1</Removed>'), 'P').type).toBe('parallelstage');
  });

  it('that does not separate stays a pod', () => {
    expect(find(pod('<Detachable>0</Detachable>'), 'P').type).toBe('podset');
  });

  /**
   * `PodHandler.endHandler` marks an ejected pod's stage inactive in the
   * configuration desktop opens on (`getSelectedConfiguration()
   * ._setStageActive(stage.getStageNumber(), false)`): the pod stays in the
   * design and sits out the flight. A detachable pod that has not been ejected
   * flies.
   */
  it('that RockSim marks ejected is grounded in the configuration the file opens on', () => {
    const ejected = (pods: string) =>
      doc(
        `<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID><AttachedParts>${pods}</AttachedParts></BodyTube>`,
      );
    const podXml = (name: string, extra: string) =>
      `<ExternalPod><Name>${name}</Name><RadialLoc>30</RadialLoc>${extra}<AttachedParts><BodyTube><Name>${name} tube</Name><Len>100</Len><OD>18</OD><ID>17</ID></BodyTube></AttachedParts></ExternalPod>`;
    const res = importRkt(
      ejected(
        podXml('Gone', '<Detachable>1</Detachable><Removed>1</Removed>') +
          podXml('Kept', '<Detachable>1</Detachable>') +
          podXml('Also gone', '<Removed>1</Removed>'),
      ),
    );
    const id = (name: string) => find(res.tree.components, name).id;
    expect(res.configs).toHaveLength(1);
    expect(res.chosenConfigId).toBe(res.configs[0]!.id);
    expect(res.configs[0]!.grounded).toEqual([id('Gone'), id('Also gone')]);
    expect(res.configs[0]!.grounded).not.toContain(id('Kept'));
    // What the opened simulation flies.
    const wired = wireLoadedOrk(res as unknown as LoadedOrk, {} as LaunchConditions);
    const config = wired.configs.find((c) => c.id === wired.sims.find((s) => s.id === wired.activeId)!.configId)!;
    expect(config.grounded).toEqual([id('Gone'), id('Also gone')]);
  });

  it('that no pod was ejected from declares no configuration', () => {
    const res = importRkt(
      doc(
        `<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID><AttachedParts><ExternalPod><Name>P</Name><Detachable>1</Detachable><AttachedParts><BodyTube><Name>T</Name><Len>100</Len><OD>18</OD><ID>17</ID></BodyTube></AttachedParts></ExternalPod></AttachedParts></BodyTube>`,
      ),
    );
    expect(res.configs).toEqual([]);
    expect(res.chosenConfigId).toBeNull();
  });

  /**
   * `PodHandler.subtractAngleOffset`: RockSim stores a pod child's angle in
   * absolute coordinates and OpenRocket stores it relative to the assembly, so
   * without this every part inside a pod is rotated by the pod's angle twice.
   */
  it('takes its own roll angle off the parts inside it', () => {
    const p = find(pod(''), 'P');
    expect(p['angleOffset']).toBeCloseTo(Math.PI / 2, 12);
    // 120 degrees absolute, inside a pod at 90, is 30 degrees relative.
    expect(find(p.children, 'Pod lug')['angleOffset']).toBeCloseTo(Math.PI / 6, 12);
  });
});

describe('a stage', () => {
  /**
   * `RocketDesignHandler.applyStageOverrides` applies the stage figures as
   * stage-level overrides with "apply to subcomponents" on, and only while
   * `UseKnownMass` is set: RockSim writes them into every file whether it uses
   * them or not.
   */
  it('takes the mass and CG RockSim states for it, over the whole subtree, when RockSim uses them', () => {
    const list = read(
      '<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID></BodyTube>',
      '<Stage3Mass>142.5</Stage3Mass><Stage3CG>210</Stage3CG><UseKnownMass>1</UseKnownMass>',
    );
    const stage = list[0]!;
    expect(stage['overrideMass']).toBeCloseTo(0.1425, 12);
    expect(stage['overrideSubcomponentsMass']).toBe(true);
    expect(stage['overrideCGX']).toBeCloseTo(0.21, 12);
    expect(stage['overrideSubcomponentsCG']).toBe(true);
  });

  it('is left alone when RockSim does not use the figures it states', () => {
    for (const flag of ['', '<UseKnownMass>0</UseKnownMass>']) {
      const stage = read(
        '<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID></BodyTube>',
        `<Stage3Mass>142.5</Stage3Mass><Stage3CG>210</Stage3CG>${flag}`,
      )[0]!;
      expect(stage['overrideMass']).toBeUndefined();
      expect(stage['overrideCGX']).toBeUndefined();
    }
  });

  const threeStage = (figures: string): ComponentNode[] =>
    importRkt(
      doc('<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID></BodyTube>', figures)
        .replace('<StageCount>1</StageCount>', '<StageCount>3</StageCount>')
        .replace(
          '</Stage3Parts>',
          '</Stage3Parts>' +
            '<Stage2Parts><BodyTube><Name>Mid</Name><Len>200</Len><OD>24</OD><ID>23</ID></BodyTube></Stage2Parts>' +
            '<Stage1Parts><BodyTube><Name>Low</Name><Len>100</Len><OD>24</OD><ID>23</ID></BodyTube></Stage1Parts>',
        ),
    ).tree.components;

  /**
   * RockSim's CGs are those of the stacks it flies (`Stage32CG`, `Stage321CG`),
   * from the nose tip, so each stage's own CG comes from the mass moments and is
   * kept from the stage's front, as `setOverrideCGX` takes it.
   */
  it("derives each stage's CG from the stack CGs, so the stacks balance where RockSim says", () => {
    const [top, mid, low] = threeStage(
      '<Stage3Mass>185</Stage3Mass><Stage2Mass>210</Stage2Mass><Stage1Mass>330</Stage1Mass>' +
        '<Stage3CG>300</Stage3CG><Stage32CG>450</Stage32CG><Stage321CG>600</Stage321CG>' +
        '<Stage2CGAlone>120</Stage2CGAlone><Stage1CGAlone>50</Stage1CGAlone><UseKnownMass>1</UseKnownMass>',
    );
    const at = (stage: ComponentNode, front: number) => (stage['overrideCGX'] as number) + front;
    // Masses in kg, stage fronts at 0, 0.3 and 0.5 m.
    const stack = (stages: [ComponentNode, number][]) => {
      const mass = stages.reduce((sum, [s]) => sum + (s['overrideMass'] as number), 0);
      return stages.reduce((sum, [s, front]) => sum + (s['overrideMass'] as number) * at(s, front), 0) / mass;
    };
    expect(top!['overrideMass']).toBeCloseTo(0.185, 12);
    expect(mid!['overrideMass']).toBeCloseTo(0.21, 12);
    expect(low!['overrideMass']).toBeCloseTo(0.33, 12);
    expect(stack([[top!, 0]])).toBeCloseTo(0.3, 12);
    expect(
      stack([
        [top!, 0],
        [mid!, 0.3],
      ]),
    ).toBeCloseTo(0.45, 12);
    expect(
      stack([
        [top!, 0],
        [mid!, 0.3],
        [low!, 0.5],
      ]),
    ).toBeCloseTo(0.6, 12);
    expect(mid!['overrideSubcomponentsCG']).toBe(true);
  });

  it('stops deriving CGs at a stage with no mass', () => {
    const [top, mid, low] = threeStage(
      '<Stage3Mass>185</Stage3Mass><Stage2Mass>0</Stage2Mass><Stage1Mass>330</Stage1Mass>' +
        '<Stage3CG>300</Stage3CG><Stage32CG>450</Stage32CG><Stage321CG>600</Stage321CG>' +
        '<UseKnownMass>1</UseKnownMass>',
    );
    expect(top!['overrideCGX']).toBeCloseTo(0.3, 12);
    expect(mid!['overrideMass']).toBeUndefined();
    expect(mid!['overrideCGX']).toBeUndefined();
    expect(low!['overrideMass']).toBeCloseTo(0.33, 12);
    expect(low!['overrideCGX']).toBeUndefined();
  });
});

describe('a nose cone or transition shape', () => {
  const nose = (shape: string, design = ''): { node: ComponentNode; notes: string[] } => {
    const res = importRkt(
      doc(`<NoseCone><Name>N</Name><Len>100</Len><BaseDia>25</BaseDia>${shape}</NoseCone>`, design),
    );
    return { node: res.tree.components[0]!.children![0]!, notes: noteTexts(res.notes) };
  };
  const transition = (shape: string): ComponentNode =>
    find(
      parts(`<Transition><Name>T</Name><Len>50</Len><FrontDia>25</FrontDia><RearDia>20</RearDia>${shape}</Transition>`),
      'T',
    );

  /** `RockSimNoseConeCode.PARABOLIC`: r = R * sqrt(x / L) is a power series of 1/2. */
  it("reads RockSim's parabola as a power series of one half, whatever ShapeParameter says", () => {
    for (const read of [
      nose('<ShapeCode>2</ShapeCode><ShapeParameter>0</ShapeParameter>').node,
      transition('<ShapeCode>2</ShapeCode><ShapeParameter>0</ShapeParameter>'),
    ]) {
      expect(read['shape']).toBe('power');
      expect(read['shapeParameter']).toBe(0.5);
    }
  });

  it('reads the elliptical code as an ellipsoid', () => {
    expect(nose('<ShapeCode>3</ShapeCode>').node['shape']).toBe('ellipsoid');
  });

  /** `RockSimNoseConeCode.SECANT_OGIVE`: a tangent ogive, with a warning. */
  it('reads a secant ogive as a tangent ogive and says so', () => {
    const { node, notes } = nose('<ShapeCode>7</ShapeCode><ShapeParameter>300</ShapeParameter>');
    expect(node['shape']).toBe('ogive');
    expect(node['shapeParameter']).toBe(1);
    expect(notes).toContain("N: RockSim's secant ogive was imported as a tangent ogive, which bulges less.");
    expect(transition('<ShapeCode>7</ShapeCode>')['shape']).toBe('ogive');
  });

  /** `fromCode` falls back to PARABOLIC, not to the last code. */
  it('reads a code RockSim does not define as its default, the parabola', () => {
    expect(nose('<ShapeCode>9</ShapeCode>').node['shape']).toBe('power');
    expect(nose('<ShapeCode>9</ShapeCode>').node['shapeParameter']).toBe(0.5);
  });

  /** `Transition.setShapeParameter` clamps, and the handlers say so. */
  it('clamps a Haack parameter past the LV-Haack and says so', () => {
    const { node, notes } = nose('<ShapeCode>6</ShapeCode><ShapeParameter>0.6</ShapeParameter>');
    expect(node['shape']).toBe('haack');
    expect(node['shapeParameter']).toBeCloseTo(1 / 3, 12);
    expect(notes).toContain('N: the shape parameter 0.6 is outside the range this app supports, so 0.3333 is used.');
    expect(transition('<ShapeCode>4</ShapeCode><ShapeParameter>-1</ShapeParameter>')['shapeParameter']).toBe(0);
  });

  it('says nothing about a parameter inside the range', () => {
    const { node, notes } = nose('<ShapeCode>4</ShapeCode><ShapeParameter>0.75</ShapeParameter>');
    expect(node['shapeParameter']).toBe(0.75);
    expect(notes.join(' ')).not.toMatch(/shape parameter/);
  });
});

describe('a nose cone base extension', () => {
  const base =
    '<NoseCone><Name>Nose cone</Name><Len>139.7</Len><BaseDia>66</BaseDia><WallThickness>2</WallThickness>' +
    '<ConstructionType>1</ConstructionType><ShapeCode>1</ShapeCode><ShoulderLen>40</ShoulderLen><ShoulderOD>64</ShoulderOD>' +
    '<Material>Balsa</Material><Density>160</Density><FinishCode>0</FinishCode>';

  /**
   * `NoseConeHandler.addBaseExtension`: RockSim puts the next part at Len plus
   * BaseExtensionLen, with the shoulder behind the extension, so it is a
   * straight transition after the nose that carries the shoulder.
   */
  it('becomes a straight transition behind the nose that takes over the shoulder', () => {
    const res = importRkt(
      doc(
        `${base}<BaseExtensionLen>50.8</BaseExtensionLen></NoseCone><BodyTube><Name>B</Name><Len>300</Len><OD>66</OD><ID>64</ID></BodyTube>`,
      ),
    );
    const [nose, ext, tube] = res.tree.components[0]!.children!;
    expect(nose!.type).toBe('nosecone');
    expect(nose!['shoulderLength']).toBe(0);
    expect(ext!.type).toBe('transition');
    expect(ext!.name).toBe('Nose cone base extension');
    expect(ext!['shape']).toBe('conical');
    expect(ext!['length']).toBeCloseTo(0.0508, 12);
    expect(ext!['foreRadius']).toBeCloseTo(0.033, 12);
    expect(ext!['aftRadius']).toBeCloseTo(0.033, 12);
    expect(ext!['thickness']).toBeCloseTo(0.002, 12);
    expect(ext!['materialName']).toBe('Balsa');
    expect(ext!['finish']).toBe('polished');
    expect(ext!['aftShoulderLength']).toBeCloseTo(0.04, 12);
    expect(ext!['aftShoulderRadius']).toBeCloseTo(0.032, 12);
    expect(ext!['overrideMass']).toBeUndefined();
    expect(tube!.name).toBe('B');
    expect(noteTexts(res.notes)).toContain(
      'Nose cone: the base extension was imported as a separate transition, "Nose cone base extension".',
    );
  });

  /** RockSim's known nose mass already covers its extension. */
  it('weighs nothing under a nose mass override', () => {
    const [nose, ext] = parts(
      `${base}<UseKnownCG>1</UseKnownCG><KnownMass>40</KnownMass><KnownCG>60</KnownCG>` +
        '<BaseExtensionLen>50.8</BaseExtensionLen></NoseCone>',
    );
    expect(nose!['overrideMass']).toBeCloseTo(0.04, 12);
    expect(ext!['overrideMass']).toBe(0);
  });

  it('is not added when the extension has no length', () => {
    expect(parts(`${base}<BaseExtensionLen>0</BaseExtensionLen></NoseCone>`)).toHaveLength(1);
  });
});

/** `NoseConeHandler`: a drilled core is not modeled, so a solid nose weighs as solid. */
describe('a drilled solid nose cone', () => {
  const notes = (construction: number) =>
    noteTexts(
      importRkt(
        doc(
          `<NoseCone><Name>N</Name><Len>100</Len><BaseDia>40</BaseDia><ConstructionType>${construction}</ConstructionType>` +
            '<CoreDia>10</CoreDia><CoreLen>50</CoreLen></NoseCone>',
        ),
      ).notes,
    );

  it('is said to weigh as a solid one', () => {
    expect(notes(0)).toContain(
      'N: the drilled core is not supported, so the mass and CG are those of a solid nose cone.',
    );
  });

  it('is not mentioned on a hollow nose', () => {
    expect(notes(1).join(' ')).not.toMatch(/drilled core/);
  });
});

/** `ParachuteHandler.setEquivalentDiameter`: the round canopy with RockSim's drag area. */
describe("a parachute's drag area", () => {
  const chute = (extra: string) => {
    const res = importRkt(
      doc(
        `<BodyTube><Name>B</Name><Len>300</Len><OD>40</OD><ID>38</ID><AttachedParts>` +
          `<Parachute><Name>C</Name><Dia>1000</Dia>${extra}</Parachute></AttachedParts></BodyTube>`,
      ),
    );
    return { node: find(res.tree.components, 'C'), notes: noteTexts(res.notes) };
  };
  const area = (n: ComponentNode) => Math.PI * ((n['diameter'] as number) / 2) ** 2;

  it('counts every canopy, each a polygon measured corner to corner, less its spill hole', () => {
    const { node, notes } = chute('<SideCount>6</SideCount><SpillHoleDia>100</SpillHoleDia><ChuteCount>2</ChuteCount>');
    const hexagon = ((3 * Math.sqrt(3)) / 2) * 0.5 * 0.5;
    expect(area(node)).toBeCloseTo(2 * (hexagon - Math.PI * 0.05 * 0.05), 12);
    // The hole is in the area: carried as well, it would come out twice.
    expect(node['spillHoleDiameter']).toBeUndefined();
    expect(notes.join(' ')).toMatch(/C: imported as a single round parachute with the same drag area/);
  });

  it('takes a missing side count as RockSim does, a hexagon', () => {
    expect(area(chute('').node)).toBeCloseTo(((3 * Math.sqrt(3)) / 2) * 0.25, 12);
  });

  it('keeps a round canopy as it is, and says nothing', () => {
    const { node, notes } = chute('<SideCount>0</SideCount>');
    expect(node['diameter']).toBeCloseTo(1, 12);
    expect(notes.join(' ')).not.toMatch(/round parachute/);
  });
});

/** `RocketDesignHandler.applyFixedCD`: RockSim's fixed Cd, for a single stage. */
describe("a design's fixed Cd", () => {
  const air = '<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID></BodyTube>';

  it("is the stage's Cd override, over its parts, when RockSim does not calculate the Cd", () => {
    const stage = read(air, '<CalculateCD>0</CalculateCD><FixedCd>0.55</FixedCd>')[0]!;
    expect(stage['overrideCD']).toBe(0.55);
    expect(stage['overrideSubcomponentsCD']).toBe(true);
  });

  it('is left alone while RockSim calculates the Cd', () => {
    expect(read(air, '<CalculateCD>1</CalculateCD><FixedCd>0.55</FixedCd>')[0]!['overrideCD']).toBeUndefined();
    expect(read(air, '<FixedCd>0.55</FixedCd>')[0]!['overrideCD']).toBeUndefined();
  });

  it('is not read for several stages, and says so', () => {
    const res = importRkt(
      doc(air, '<CalculateCD>0</CalculateCD><FixedCd>0.55</FixedCd>')
        .replace('<StageCount>1</StageCount>', '<StageCount>2</StageCount>')
        .replace('</Stage3Parts>', `</Stage3Parts><Stage2Parts>${air}</Stage2Parts>`),
    );
    expect(res.tree.components.every((s) => s['overrideCD'] === undefined)).toBe(true);
    expect(noteTexts(res.notes)).toContain(
      'The fixed Cd of a multi-stage RockSim design is not imported, so the Cd is calculated.',
    );
  });
});

describe("a design's own information", () => {
  const air = '<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID></BodyTube>';

  /** `RocketDesignHandler`: `Comments`, `Designer` and `Revisions` are the rocket's. */
  it('keeps the comments, the designer and the revision history', () => {
    const { tree } = importRkt(
      doc(
        air,
        '<Comments>KV-64</Comments><Designer>Semroc Astronautics Corp</Designer>' +
          '<Revisions>2-21-2010: new nose cone</Revisions>',
      ),
    );
    expect(tree.comment).toBe('KV-64');
    expect(tree.designer).toBe('Semroc Astronautics Corp');
    expect(tree.revision).toBe('2-21-2010: new nose cone');
  });

  /** `RockSimContentHandler`: RockSim 11 writes version 4. */
  it('says when the file is newer than RockSim 11 writes', () => {
    const newer = (v: number) =>
      noteTexts(
        importRkt(doc(air).replace('<DesignInformation>', `<FileVersion>${v}</FileVersion><DesignInformation>`)).notes,
      );
    expect(newer(5)).toContain(
      'RockSim file version 5 is newer than the supported version 4, so some data may not be imported.',
    );
    expect(newer(4).join(' ')).not.toMatch(/newer than/);
  });
});

describe('a negative dimension', () => {
  /** The handlers wrap most dimensions in `Math.max(0, …)`. */
  it('is floored at zero rather than reaching the tree', () => {
    const tube = find(parts('<BodyTube><Name>Bad</Name><Len>-100</Len><OD>-20</OD></BodyTube>'), 'Bad');
    expect(tube['length']).toBe(0);
    expect(tube['outerRadius']).toBe(0);
  });
});

describe('a fin set on a nose cone or transition', () => {
  const onTransition = (shapeCode: number, extra = ''): ComponentNode[] =>
    parts(
      `<Transition><Name>T</Name><Len>60</Len><FrontDia>24</FrontDia><RearDia>18</RearDia><AttachedParts>
      <FinSet><Name>F</Name><ShapeCode>${shapeCode}</ShapeCode><FinCount>3</FinCount>
      <RootChord>60</RootChord><TipChord>30</TipChord><SemiSpan>45</SemiSpan><SweepDistance>25</SweepDistance>
      <Thickness>3</Thickness>${extra}</FinSet></AttachedParts></Transition>`,
    );

  /**
   * `Transition.isCompatible` admits only an internal component and a
   * FreeformFinSet, and a NoseCone is a Transition, so a trapezoid there has to
   * become freeform before it can be attached at all. Desktop reads the outline
   * off the detached fin, whose root points are a single zero, so the result is
   * the four plain corners.
   */
  it('turns a trapezoid into the freeform outline of its four corners', () => {
    const f = find(onTransition(0), 'F');
    expect(f.type).toBe('freeformfinset');
    expect(f['points']).toEqual([
      [0, 0],
      [0.025, 0.045],
      [0.055, 0.045],
      [0.06, 0],
    ]);
    // The trapezoid dimensions are gone: the outline is the shape now, and
    // leaving both would let the two disagree.
    expect(f['rootChord']).toBeUndefined();
    expect(f['sweep']).toBeUndefined();
    // Everything that is not the outline survives the conversion.
    expect(f['finCount']).toBe(3);
    expect(f['thickness']).toBeCloseTo(0.003, 12);
  });

  it('omits the tip corner on a fin that tapers to a point', () => {
    const f = find(
      parts(
        `<NoseCone><Name>N</Name><Len>100</Len><BaseDia>24</BaseDia><AttachedParts>
        <FinSet><Name>F</Name><ShapeCode>0</ShapeCode><FinCount>3</FinCount><RootChord>60</RootChord>
        <TipChord>0</TipChord><SemiSpan>45</SemiSpan><SweepDistance>60</SweepDistance><Thickness>3</Thickness>
        </FinSet></AttachedParts></NoseCone>`,
      ),
      'F',
    );
    expect(f['points']).toEqual([
      [0, 0],
      [0.06, 0.045],
      [0.06, 0],
    ]);
  });

  it('leaves a trapezoid on a body tube alone', () => {
    const f = find(
      parts(
        `<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID><AttachedParts>
        <FinSet><Name>F</Name><ShapeCode>0</ShapeCode><FinCount>3</FinCount><RootChord>60</RootChord>
        <TipChord>30</TipChord><SemiSpan>45</SemiSpan><SweepDistance>25</SweepDistance><Thickness>3</Thickness>
        </FinSet></AttachedParts></BodyTube>`,
      ),
      'F',
    );
    expect(f.type).toBe('trapezoidfinset');
    expect(f['rootChord']).toBeCloseTo(0.06, 12);
    expect(f['points']).toBeUndefined();
  });

  /** Desktop's answer is the handler's "can not be attached, ignoring component". */
  it('drops an elliptical one and says so', () => {
    const res = importRkt(
      doc(
        `<Transition><Name>T</Name><Len>60</Len><FrontDia>24</FrontDia><RearDia>18</RearDia><AttachedParts>
        <FinSet><Name>F</Name><ShapeCode>1</ShapeCode><FinCount>3</FinCount><RootChord>60</RootChord>
        <SemiSpan>45</SemiSpan><Thickness>3</Thickness></FinSet></AttachedParts></Transition>`,
      ),
    );
    expect(() => find(res.tree.components, 'F')).toThrow();
    expect(noteTexts(res.notes).join(' ')).toMatch(/elliptical fin set on a nose cone or transition/i);
  });

  it('keeps a freeform one as it is', () => {
    const f = find(onTransition(2, '<PointList>0,0|20,40|50,0</PointList>'), 'F');
    expect(f.type).toBe('freeformfinset');
    expect(f['points']).toEqual([
      [0, 0],
      [0.02, 0.04],
      [0.05, 0],
    ]);
  });
});

/**
 * `FinSetHandler.toCoordinates`: RockSim writes a custom fin from the trailing
 * root point back to `0,0`. Desktop drops a `0,0` that repeats the one before
 * it and reverses a list that ends at `0,0`, so the outline runs leading edge
 * first; read in file order, the fin flies backward.
 */
describe('a RockSim point list', () => {
  const points = (list: string): unknown =>
    find(
      parts(
        `<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID><AttachedParts>
        <CustomFinSet><Name>F</Name><ShapeCode>2</ShapeCode><FinCount>3</FinCount><Thickness>3</Thickness>
        <PointList>${list}</PointList></CustomFinSet></AttachedParts></BodyTube>`,
      ),
      'F',
    )['points'];
  const LEADING_FIRST = [
    [0, 0],
    [0.02, 0.04],
    [0.05, 0],
  ];

  it('is read leading edge first when RockSim wrote it trailing edge first', () => {
    expect(points('50,0|20,40|0,0|')).toEqual(LEADING_FIRST);
  });

  it('drops a 0,0 that repeats the one before it', () => {
    expect(points('50,0|20,40|0,0|0,0|0,0|')).toEqual(LEADING_FIRST);
  });

  it('keeps a list that already runs leading edge first', () => {
    expect(points('0,0|20,40|50,0')).toEqual(LEADING_FIRST);
  });
});

describe('a shoulder RockSim gives a length to', () => {
  /**
   * Neither RockSim nor its handlers have a cap flag, and desktop 24.12's
   * `Transition.setAftShoulderLength` / `setForeShoulderLength` store the length
   * and nothing more, so a shoulder desktop reads from a `.rkt` is open. The
   * node carries no cap key, and `ComponentFactory` then sets the cap off after
   * the length (`rktShoulderCap.kernel.test.ts` holds the kernel to that).
   */
  it('is open, as desktop 24.12 reads it', () => {
    const n = find(
      parts(
        '<NoseCone><Name>N</Name><Len>100</Len><BaseDia>24</BaseDia><ConstructionType>1</ConstructionType><WallThickness>1.5</WallThickness><ShoulderOD>23</ShoulderOD><ShoulderLen>20</ShoulderLen></NoseCone>',
      ),
      'N',
    );
    expect(n['shoulderCapped']).toBeUndefined();
  });

  it('says nothing about a cap when there is no shoulder', () => {
    const n = find(parts('<NoseCone><Name>N</Name><Len>100</Len><BaseDia>24</BaseDia></NoseCone>'), 'N');
    expect(n['shoulderCapped']).toBeUndefined();
  });

  it('is open on both sides of a transition', () => {
    const t = find(
      parts(
        '<Transition><Name>T</Name><Len>50</Len><FrontDia>18</FrontDia><RearDia>24</RearDia><FrontShoulderDia>17</FrontShoulderDia><FrontShoulderLen>15</FrontShoulderLen><RearShoulderDia>23</RearShoulderDia><RearShoulderLen>0</RearShoulderLen></Transition>',
      ),
      'T',
    );
    expect(t['foreShoulderCapped']).toBeUndefined();
    expect(t['aftShoulderCapped']).toBeUndefined();
  });
});

/**
 * `TubeFinSet.setFinCount` clamps to 8, like every fin set, and the engine
 * boundary rejects a count above it. A tube count past 8 that imported as
 * written would open as a design the engine refuses to build.
 */
describe('a tube fin set', () => {
  const tubes = (count: number): ComponentNode =>
    find(
      parts(
        `<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID><AttachedParts><TubeFinSet><Name>TF</Name><TubeCount>${count}</TubeCount><Len>50</Len><OD>10</OD><ID>9</ID></TubeFinSet></AttachedParts></BodyTube>`,
      ),
      'TF',
    );

  it('clamps the tube count to the kernel fin limit', () => {
    expect(tubes(12)['finCount']).toBe(8);
    expect(tubes(6)['finCount']).toBe(6);
  });
});

describe('a part goes where its container puts it', () => {
  /**
   * The handler that opens a `BodyTube` decides its type, not `IsInsideTube`:
   * `StageHandler` builds a BodyTube, and `AttachedPartsHandler` builds an
   * InnerTube unless its parent is a pod.
   */
  it('reads a stage-level tube as a body tube whatever IsInsideTube says', () => {
    const tube = find(
      parts('<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID><IsInsideTube>1</IsInsideTube></BodyTube>'),
      'Air',
    );
    expect(tube.type).toBe('bodytube');
  });

  it('reads a tube attached to a tube as an inner tube whatever IsInsideTube says', () => {
    const list = parts(
      `<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID><AttachedParts>
      <BodyTube><Name>Mount</Name><Len>70</Len><OD>18.7</OD><ID>18</ID><IsInsideTube>0</IsInsideTube></BodyTube>
      </AttachedParts></BodyTube>`,
    );
    expect(find(list, 'Mount').type).toBe('innertube');
  });

  /**
   * `BaseHandler.isCompatible`: a part its parent cannot hold is left out with
   * a warning ("can not be attached to ..., ignoring component") and the rest
   * of the design opens.
   */
  it('leaves out a part its parent cannot hold, says so, and opens the rest', () => {
    const res = importRkt(
      doc(`<NoseCone><Name>Nose</Name><Len>100</Len><BaseDia>24</BaseDia><AttachedParts>
      <LaunchLug><Name>Lug</Name><Len>20</Len><OD>5</OD><ID>4</ID></LaunchLug>
      </AttachedParts></NoseCone>
      <BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID></BodyTube>`),
    );
    const list = res.tree.components[0]!.children ?? [];
    expect(() => find(list, 'Lug')).toThrow();
    expect(find(list, 'Nose').children ?? []).toEqual([]);
    expect(find(list, 'Air').type).toBe('bodytube');
    expect(noteTexts(res.notes).some((t) => t.includes('Launch lug') && t.includes('Nose cone'))).toBe(true);
  });

  it('leaves out a part the stage itself cannot hold', () => {
    const res = importRkt(
      doc(`<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID></BodyTube>
      <Parachute><Name>Chute</Name><Dia>300</Dia></Parachute>`),
    );
    expect(() => find(res.tree.components, 'Chute')).toThrow();
    expect(noteTexts(res.notes).some((t) => t.includes('Parachute') && t.includes('Stage'))).toBe(true);
  });
});

/**
 * `TransitionHandler` extends `BaseHandler`, not `PositionDependentHandler`, so
 * desktop never reads a transition's `Xb` or `LocationMode`: the transition
 * sits where the body chain puts it, whatever the file says.
 */
describe('a transition', () => {
  it('takes no placement from the file', () => {
    const t = find(
      parts(
        `<NoseCone><Name>N</Name><Len>100</Len><BaseDia>24</BaseDia></NoseCone>
        <Transition><Name>T</Name><Len>40</Len><FrontDia>24</FrontDia><RearDia>18</RearDia>
        <ShapeCode>0</ShapeCode><Xb>50</Xb><LocationMode>1</LocationMode></Transition>`,
      ),
      'T',
    );
    expect(t.position).toBeUndefined();
  });

  /** A new `Transition` is conical and a new `NoseCone` an ogive; neither handler sets a shape the file leaves out. */
  it('with no ShapeCode is conical, where a nose cone with none is an ogive', () => {
    const read2 = parts(
      `<NoseCone><Name>N</Name><Len>100</Len><BaseDia>24</BaseDia></NoseCone>
      <Transition><Name>T</Name><Len>40</Len><FrontDia>24</FrontDia><RearDia>18</RearDia></Transition>`,
    );
    expect(find(read2, 'T')['shape']).toBe('conical');
    expect(find(read2, 'N')['shape']).toBe('ogive');
  });
});

/** `RingHandler.endHandler` converts usage codes 1, 2 and 4 and leaves the rest, a sleeve (3) included, the centering ring it started as. */
it('reads a sleeve ring as a centering ring', () => {
  const ring = find(
    parts(
      `<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID><AttachedParts>
      <Ring><Name>Sleeve</Name><UsageCode>3</UsageCode><Len>20</Len><OD>26</OD><ID>24</ID></Ring>
      </AttachedParts></BodyTube>`,
    ),
    'Sleeve',
  );
  expect(ring.type).toBe('centeringring');
});

/** The same `else`: a usage code past the five RockSim defines is a centering ring too, not the last of them. */
it('reads a ring with an unknown usage code as a centering ring', () => {
  const ring = find(
    parts(
      `<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID><AttachedParts>
      <Ring><Name>Odd</Name><UsageCode>7</UsageCode><Len>20</Len><OD>23</OD><ID>18</ID></Ring>
      </AttachedParts></BodyTube>`,
    ),
    'Odd',
  );
  expect(ring.type).toBe('centeringring');
});

/** `ParachuteHandler` keeps a chute with no shroud lines (`Math.max(0, n)`). */
it('reads a parachute with no shroud lines as none', () => {
  const chute = find(
    parts(
      `<BodyTube><Name>Air</Name><Len>300</Len><OD>24</OD><ID>23</ID><AttachedParts>
      <Parachute><Name>Chute</Name><Dia>300</Dia><ShroudLineCount>0</ShroudLineCount></Parachute>
      </AttachedParts></BodyTube>`,
    ),
    'Chute',
  );
  expect(chute['lineCount']).toBe(0);
});
