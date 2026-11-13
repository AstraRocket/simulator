// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { importRkt } from '../../../src/services/files/rktImport';
import { MAX_COMPONENTS } from '../../../src/services/files/ork/importLimits';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';
import { noteTexts } from '../../testing/importNotes';

// RockSim is mm and grams, and every circular dimension is a diameter.
const RKT = `<?xml version="1.0" encoding="UTF-8"?>
<RockSimDocument>
  <FileVersion>4</FileVersion>
  <DesignInformation>
    <RocketDesign>
      <Name>Fixture Bird</Name>
      <StageCount>1</StageCount>
      <Stage3Parts>
        <NoseCone>
          <Name>Nose</Name>
          <KnownMass>9.5</KnownMass>
          <Density>1050</Density>
          <DensityType>0</DensityType>
          <Material>Polystyrene</Material>
          <KnownCG>40</KnownCG>
          <UseKnownCG>1</UseKnownCG>
          <Len>100</Len>
          <BaseDia>24.8</BaseDia>
          <WallThickness>1.5</WallThickness>
          <ConstructionType>1</ConstructionType>
          <ShapeCode>1</ShapeCode>
          <ShapeParameter>0.75</ShapeParameter>
          <ShoulderOD>23.6</ShoulderOD>
          <ShoulderLen>20</ShoulderLen>
          <FinishCode>1</FinishCode>
          <AttachedParts/>
        </NoseCone>
        <BodyTube>
          <Name>Airframe</Name>
          <Len>300</Len>
          <OD>24.8</OD>
          <ID>24.0</ID>
          <IsInsideTube>0</IsInsideTube>
          <IsMotorMount>0</IsMotorMount>
          <FinishCode>2</FinishCode>
          <Material>Kraft phenolic</Material>
          <AttachedParts>
            <FinSet>
              <Name>Fins</Name>
              <ShapeCode>0</ShapeCode>
              <FinCount>3</FinCount>
              <RootChord>60</RootChord>
              <TipChord>30</TipChord>
              <SemiSpan>45</SemiSpan>
              <SweepDistance>25</SweepDistance>
              <Thickness>3.2</Thickness>
              <CantAngle>0.05</CantAngle>
              <RadialAngle>30</RadialAngle>
              <TabLength>40</TabLength>
              <TabDepth>5</TabDepth>
              <TabOffset>10</TabOffset>
              <Xb>-60</Xb>
              <LocationMode>2</LocationMode>
              <Material>Basswood</Material>
            </FinSet>
            <LaunchLug>
              <Name>Lug</Name>
              <Len>35</Len>
              <OD>4.8</OD>
              <ID>4.0</ID>
              <RadialAngle>90</RadialAngle>
              <Xb>100</Xb>
              <LocationMode>0</LocationMode>
            </LaunchLug>
            <BodyTube>
              <Name>Motor mount</Name>
              <IsInsideTube>1</IsInsideTube>
              <IsMotorMount>1</IsMotorMount>
              <EngineOverhang>3</EngineOverhang>
              <Len>70</Len>
              <OD>18.7</OD>
              <ID>18.0</ID>
              <Xb>-70</Xb>
              <LocationMode>2</LocationMode>
              <AttachedParts>
                <Ring>
                  <Name>Aft ring</Name>
                  <UsageCode>0</UsageCode>
                  <Len>3</Len>
                  <OD>24.0</OD>
                  <ID>18.7</ID>
                  <Xb>0</Xb>
                  <LocationMode>2</LocationMode>
                </Ring>
                <Ring>
                  <Name>Thrust ring</Name>
                  <UsageCode>2</UsageCode>
                  <Len>3</Len>
                  <OD>18.0</OD>
                  <ID>14.0</ID>
                </Ring>
              </AttachedParts>
            </BodyTube>
            <Parachute>
              <Name>Chute</Name>
              <Dia>400</Dia>
              <DragCoefficient>0.8</DragCoefficient>
              <ShroudLineCount>6</ShroudLineCount>
              <ShroudLineLen>350</ShroudLineLen>
              <SpillHoleDia>40</SpillHoleDia>
              <ShroudLineMassPerMM>0.0001</ShroudLineMassPerMM>
              <ShroudLineMaterial>Braided nylon</ShroudLineMaterial>
              <Density>0.0067</Density>
              <DensityType>1</DensityType>
              <Thickness>0.05</Thickness>
              <Material>Ripstop nylon</Material>
            </Parachute>
            <MassObject>
              <Name>Shock cord</Name>
              <TypeCode>1</TypeCode>
              <Len>1000</Len>
              <KnownMass>6</KnownMass>
            </MassObject>
            <MassObject>
              <Name>Altimeter</Name>
              <TypeCode>0</TypeCode>
              <Len>50</Len>
              <Dia>20</Dia>
              <KnownMass>22</KnownMass>
            </MassObject>
            <RingTail>
              <Name>Ringtail</Name>
              <KnownMass>0.</KnownMass>
              <UseKnownCG>0</UseKnownCG>
              <Xb>149.225</Xb>
              <LocationMode>0</LocationMode>
              <Len>76.2</Len>
              <CalcMass>15.9106</CalcMass>
              <CalcCG>38.1</CalcCG>
            </RingTail>
            <Strake>
              <Name>Not supported</Name>
              <Len>40</Len>
            </Strake>
          </AttachedParts>
        </BodyTube>
      </Stage3Parts>
      <Stage2Parts/>
      <Stage1Parts/>
    </RocketDesign>
  </DesignInformation>
</RockSimDocument>`;

const res = importRkt(RKT);
const stage = res.tree.components[0]!;
const byName = (nodes: ComponentNode[] | undefined, name: string): ComponentNode => {
  const walk = (list: ComponentNode[] | undefined): ComponentNode | undefined => {
    for (const n of list ?? []) {
      if (n.name === name) return n;
      const hit = walk(n.children);
      if (hit) return hit;
    }
    return undefined;
  };
  const found = walk(nodes);
  if (!found) throw new Error(`no component named ${name}`);
  return found;
};

describe('importRkt', () => {
  it('reads the design name and makes one stage per declared stage', () => {
    expect(res.name).toBe('Fixture Bird');
    expect(res.tree.components).toHaveLength(1);
    expect(stage.type).toBe('stage');
    expect(stage.name).toBe('Sustainer');
  });

  it('converts millimeters to meters and diameters to radii', () => {
    const nose = byName(stage.children, 'Nose');
    expect(nose.type).toBe('nosecone');
    expect(nose['length']).toBeCloseTo(0.1, 9);
    expect(nose['aftRadius']).toBeCloseTo(0.0124, 9);
    expect(nose['thickness']).toBeCloseTo(0.0015, 9);
    expect(nose['shoulderRadius']).toBeCloseTo(0.0118, 9);
    expect(nose['shoulderLength']).toBeCloseTo(0.02, 9);
  });

  it('maps the shape, finish and construction codes', () => {
    const nose = byName(stage.children, 'Nose');
    expect(nose['shape']).toBe('ogive');
    // `NoseConeHandler` applies the parameter only to power, parabolic and haack.
    expect(nose['shapeParameter']).toBeUndefined();
    expect(nose['finish']).toBe('smooth');
    expect(nose['filled']).toBeUndefined();
    expect(byName(stage.children, 'Airframe')['finish']).toBeUndefined();
  });

  it('takes a measured mass and CG only when UseKnownCG says to', () => {
    const nose = byName(stage.children, 'Nose');
    expect(nose['overrideMass']).toBeCloseTo(0.0095, 9);
    expect(nose['overrideCGX']).toBeCloseTo(0.04, 9);
    const tube = byName(stage.children, 'Airframe');
    expect(tube['overrideMass']).toBeUndefined();
    expect(tube['overrideCGX']).toBeUndefined();
  });

  it('derives a wall thickness from the two diameters', () => {
    const tube = byName(stage.children, 'Airframe');
    expect(tube.type).toBe('bodytube');
    expect(tube['outerRadius']).toBeCloseTo(0.0124, 9);
    expect(tube['thickness']).toBeCloseTo(0.0004, 9);
  });

  it('reads a trapezoidal fin set, its cant, its rotation and its tab', () => {
    const fins = byName(stage.children, 'Fins');
    expect(fins.type).toBe('trapezoidfinset');
    expect(fins['finCount']).toBe(3);
    expect(fins['rootChord']).toBeCloseTo(0.06, 9);
    expect(fins['tipChord']).toBeCloseTo(0.03, 9);
    expect(fins['height']).toBeCloseTo(0.045, 9);
    expect(fins['sweep']).toBeCloseTo(0.025, 9);
    expect(fins['thickness']).toBeCloseTo(0.0032, 9);
    // Cant is radians in the file (`FinSetHandler`); `RadialAngle` is degrees.
    expect(fins['cant']).toBeCloseTo(0.05, 12);
    expect(fins['rotation']).toBeCloseTo(Math.PI / 6, 12);
    expect(fins['tabLength']).toBeCloseTo(0.04, 9);
    expect(fins['tabHeight']).toBeCloseTo(0.005, 9);
    expect(fins['tabOffset']).toBeCloseTo(0.01, 9);
    expect(fins['tabOffsetMethod']).toBe('top');
  });

  it('flips the sign of a back-of-parent offset, and only that one', () => {
    expect(byName(stage.children, 'Fins').position).toEqual({ method: 'bottom', offset: 0.06 });
    expect(byName(stage.children, 'Lug').position).toEqual({ method: 'top', offset: 0.1 });
  });

  it('reads a tube in the attached parts of another tube as an inner tube', () => {
    const mount = byName(stage.children, 'Motor mount');
    expect(mount.type).toBe('innertube');
    expect(mount['motorMount']).toBe(true);
    expect(mount['motorOverhang']).toBeCloseTo(0.003, 9);
    expect(mount['outerRadius']).toBeCloseTo(0.00935, 9);
    expect(byName(stage.children, 'Airframe')['motorMount']).toBeUndefined();
  });

  it('turns a Ring into the type its UsageCode names', () => {
    expect(byName(stage.children, 'Aft ring').type).toBe('centeringring');
    expect(byName(stage.children, 'Aft ring')['innerRadius']).toBeCloseTo(0.00935, 9);
    expect(byName(stage.children, 'Thrust ring').type).toBe('engineblock');
  });

  it('leaves a centering ring with an ID of 0 automatic, as desktop opens it', () => {
    // `setInnerRadius(0)` on a new CenteringRing returns before turning Automatic off.
    const ring = byName(importRkt(RKT.replace('<ID>18.7</ID>', '<ID>0</ID>')).tree.components[0]!.children, 'Aft ring');
    expect(ring['innerRadiusAuto']).toBe(true);
    expect(ring['outerRadius']).toBeCloseTo(0.012, 9);
    expect(byName(stage.children, 'Aft ring')['innerRadiusAuto']).toBeUndefined();
  });

  it('keeps a shroud line density of 0, weightless lines as desktop applies it', () => {
    const doc = RKT.replace(
      '<ShroudLineMassPerMM>0.0001</ShroudLineMassPerMM>',
      '<ShroudLineMassPerMM>0</ShroudLineMassPerMM>',
    );
    expect(byName(importRkt(doc).tree.components[0]!.children, 'Chute')['lineDensity']).toBe(0);
  });

  it('reads a parachute, including the surface and line densities', () => {
    const chute = byName(stage.children, 'Chute');
    expect(chute.type).toBe('parachute');
    // With no `SideCount` the `Dia` is a hexagon across corners, less the spill hole.
    const hexagon = ((3 * Math.sqrt(3)) / 2) * 0.2 * 0.2;
    expect(Math.PI * ((chute['diameter'] as number) / 2) ** 2).toBeCloseTo(hexagon - Math.PI * 0.02 * 0.02, 12);
    expect(chute['spillHoleDiameter']).toBeUndefined();
    expect(chute['cd']).toBe(0.8);
    expect(chute['lineCount']).toBe(6);
    expect(chute['lineLength']).toBeCloseTo(0.35, 9);
    // g/cm2 to kg/m2 is x10; backwards is a plausible factor of 100. Not `density`, which is bulk.
    expect(chute['surfaceDensity']).toBeCloseTo(0.067, 9);
    expect(chute['surfaceMaterialName']).toBe('Ripstop nylon');
    expect(chute.density).toBeUndefined();
    // Line density is per millimeter of cord in the file.
    expect(chute['lineDensity']).toBeCloseTo(0.0001, 9);
    expect(chute['lineMaterialName']).toBe('Braided nylon');
  });

  it('splits a MassObject into a shock cord or a mass by TypeCode', () => {
    const cord = byName(stage.children, 'Shock cord');
    expect(cord.type).toBe('shockcord');
    expect(cord['cordLength']).toBeCloseTo(1, 9);
    expect(cord['lineDensity']).toBe(0);
    expect(cord['lineMaterialName']).toBe('');

    const alt = byName(stage.children, 'Altimeter');
    expect(alt.type).toBe('masscomponent');
    expect(alt['mass']).toBeCloseTo(0.022, 9);
    expect(alt['length']).toBeCloseTo(0.05, 9);
    expect(alt['radius']).toBeCloseTo(0.01, 9);
    expect(alt['overrideMass']).toBeUndefined();
  });

  it('reads a ring tail as a mass component, and says its drag is not flown', () => {
    const tail = byName(stage.children, 'Ringtail');
    expect(tail.type).toBe('masscomponent');
    expect(tail['mass']).toBeCloseTo(0.0159106, 12);
    expect(tail['length']).toBeCloseTo(0.0762, 12);
    expect(tail.position).toEqual({ method: 'top', offset: 0.149225 });
    expect(tail['overrideCGX']).toBeCloseTo(0.0381, 12);
    expect(tail['overrideMass']).toBeUndefined();
    expect(res.ignored).not.toContain('RingTail');
    expect(noteTexts(res.notes)).toContain(
      'Ringtail: the ring tail was imported as a mass component, so its drag is not simulated.',
    );
  });

  it('names what it could not bring across, and what never transfers', () => {
    expect(res.ignored).toContain('Strake');
    expect(noteTexts(res.notes).join(' ')).toContain('Strake');
    expect(noteTexts(res.notes).join(' ')).toMatch(/motor selections and launch conditions are not imported/i);
    expect(noteTexts(res.notes)).toContain(
      'Chute: imported as a single round parachute with the same drag area, 361.6 mm across instead of 400.0 mm.',
    );
  });

  it('refuses a file that is not a RockSim design', () => {
    expect(() => importRkt('<openrocket><rocket/></openrocket>')).toThrow(/not a \.rkt/i);
  });

  it('names its own format when the XML does not parse', () => {
    expect(() => importRkt('<RockSimDocument><DesignInformation>')).toThrow(/not a valid \.rkt file/i);
  });
});

describe('importRkt, multi-stage', () => {
  const twoStage = RKT.replace('<StageCount>1</StageCount>', '<StageCount>2</StageCount>').replace(
    '<Stage2Parts/>',
    '<Stage2Parts><BodyTube><Name>Booster tube</Name><Len>200</Len><OD>24.8</OD><ID>24.0</ID></BodyTube></Stage2Parts>',
  );

  it('orders the stages nose-first, which is RockSim 3 → 1', () => {
    const r = importRkt(twoStage);
    expect(r.tree.components).toHaveLength(2);
    expect(r.tree.components[0]!.name).toBe('Sustainer');
    expect(byName(r.tree.components[0]!.children, 'Nose')).toBeTruthy();
    expect(r.tree.components[1]!.name).toBe('Booster 1');
    expect(byName(r.tree.components[1]!.children, 'Booster tube')).toBeTruthy();
  });
});

describe('importRkt, hostile input', () => {
  const rkt = (parts: string): string =>
    `<RockSimDocument><DesignInformation><RocketDesign><Name>Many</Name><StageCount>1</StageCount>` +
    `<Stage3Parts>${parts}</Stage3Parts></RocketDesign></DesignInformation></RockSimDocument>`;
  const tube = '<BodyTube><Name>b</Name><Len>100</Len><OD>20</OD><ID>19</ID></BodyTube>';

  it('refuses more components than MAX_COMPONENTS with a clear error', () => {
    expect(() => importRkt(rkt(tube.repeat(MAX_COMPONENTS)))).toThrow(/too many components/i);
  });

  it('still accepts a component count a real design could plausibly use', () => {
    const res = importRkt(rkt(tube.repeat(200)));
    expect(res.tree.components[0]?.children?.length).toBe(200);
  });
});

describe('a .rkt shoulder wider than its end', () => {
  const doc = (part: string): string =>
    `<RockSimDocument><DesignInformation><RocketDesign><Name>Wide</Name><StageCount>1</StageCount>` +
    `<Stage3Parts>${part}</Stage3Parts></RocketDesign></DesignInformation></RockSimDocument>`;

  it('opens a nose cone shoulder at the base radius', () => {
    const res = importRkt(
      doc(
        '<NoseCone><Name>n</Name><Len>100</Len><BaseDia>25</BaseDia><WallThickness>1</WallThickness>' +
          '<ShapeCode>1</ShapeCode><ShoulderOD>30</ShoulderOD><ShoulderLen>20</ShoulderLen></NoseCone>',
      ),
    );
    const nose = res.tree.components[0]!.children![0]!;
    expect(nose['aftRadius']).toBeCloseTo(0.0125, 9);
    expect(nose['shoulderRadius']).toBeCloseTo(0.0125, 9);
  });

  it('opens each transition shoulder at its own end', () => {
    const res = importRkt(
      doc(
        '<Transition><Name>t</Name><Len>50</Len><FrontDia>30</FrontDia><RearDia>20</RearDia>' +
          '<WallThickness>1</WallThickness><ShapeCode>0</ShapeCode>' +
          '<FrontShoulderDia>34</FrontShoulderDia><FrontShoulderLen>10</FrontShoulderLen>' +
          '<RearShoulderDia>18</RearShoulderDia><RearShoulderLen>10</RearShoulderLen></Transition>',
      ),
    );
    const t = res.tree.components[0]!.children![0]!;
    expect(t['foreShoulderRadius']).toBeCloseTo(0.015, 9);
    expect(t['aftShoulderRadius']).toBeCloseTo(0.009, 9);
  });
});

// setAngleOffset clamps outside [-180°, 180°], so the reader wraps 270° to -90°.
describe('a .rkt lug or rail button past 180 degrees', () => {
  const doc = (part: string): string =>
    `<RockSimDocument><DesignInformation><RocketDesign><Name>Lug</Name><StageCount>1</StageCount>` +
    `<Stage3Parts><BodyTube><Name>b</Name><Len>300</Len><OD>40</OD><ID>39</ID><AttachedParts>${part}` +
    `</AttachedParts></BodyTube></Stage3Parts></RocketDesign></DesignInformation></RockSimDocument>`;

  it('comes in at the same place, inside the range the kernel keeps', () => {
    const res = importRkt(
      doc('<LaunchLug><Name>Lug</Name><Len>35</Len><OD>4.8</OD><RadialAngle>270</RadialAngle></LaunchLug>'),
    );
    const lug = res.tree.components[0]!.children![0]!.children![0]!;
    expect(lug['angleOffset']).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('keeps 180 as 180', () => {
    const res = importRkt(
      doc('<LaunchLug><Name>Lug</Name><Len>35</Len><OD>4.8</OD><RadialAngle>180</RadialAngle></LaunchLug>'),
    );
    expect(res.tree.components[0]!.children![0]!.children![0]!['angleOffset']).toBeCloseTo(Math.PI, 9);
  });
});
