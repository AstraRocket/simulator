// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { importOrk, exportOrk } from '../../../src/services/files/orkFile';
import { importRkt } from '../../../src/services/files/rktImport';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';
import { MAX_FIN_POINTS } from '../../../src/services/files/ork/importLimits';
import { noteTexts } from '../../testing/importNotes';

const ork = (xml: string): ArrayBuffer => {
  const zipped = zipSync({ 'rocket.ork': strToU8(xml) });
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
};

const wrap = (inner: string, stageExtra = '') =>
  `<?xml version="1.0"?><openrocket version="1.8"><rocket><name>T</name>${stageExtra}<subcomponents><stage><name>S</name><subcomponents>${inner}</subcomponents></stage></subcomponents></rocket></openrocket>`;

const flatten = (nodes: ComponentNode[]): ComponentNode[] =>
  nodes.flatMap((n) => [n, ...flatten((n.children ?? []) as ComponentNode[])]);

const nodeOfType = (xml: string, type: string): ComponentNode => {
  const res = importOrk(ork(wrap(xml)));
  const found = flatten(res.tree.components).find((n) => n.type === type);
  if (!found) throw new Error(`no ${type} in the imported tree`);
  return found;
};

describe('a .ork cannot state a negative dimension', () => {
  it('floors a body tube length, radius and wall', () => {
    const n = nodeOfType(
      '<bodytube><name>B</name><length>-0.3</length><radius>-0.012</radius><thickness>-0.001</thickness></bodytube>',
      'bodytube',
    );
    expect(n['length']).toBe(0);
    expect(n['thickness']).toBe(0);
    // `autoRadiusTag` requires `> 0`, so a negative radius reads as automatic.
    expect(n['outerRadiusAuto']).toBe(true);
  });

  it('floors every trapezoid fin dimension but the sweep', () => {
    const n = nodeOfType(
      `<trapezoidfinset><name>F</name><fincount>3</fincount>
         <rootchord>-0.05</rootchord><tipchord>-0.03</tipchord>
         <sweeplength>-0.02</sweeplength><height>-0.03</height><thickness>-0.003</thickness>
       </trapezoidfinset>`,
      'trapezoidfinset',
    );
    expect(n['rootChord']).toBe(0);
    expect(n['tipChord']).toBe(0);
    expect(n['height']).toBe(0);
    expect(n['thickness']).toBe(0);
    // A negative sweep is a real forward-swept fin.
    expect(n['sweep']).toBe(-0.02);
  });

  it('floors a nose cone length and its shape parameter', () => {
    const n = nodeOfType(
      '<nosecone><name>N</name><length>-0.1</length><shape>ogive</shape><shapeparameter>-1</shapeparameter></nosecone>',
      'nosecone',
    );
    expect(n['length']).toBe(0);
    expect(n['shapeParameter']).toBe(0);
  });

  it('floors a launch lug, where the radius is a plain tag and not an auto one', () => {
    const n = nodeOfType(
      '<launchlug><name>L</name><length>-0.05</length><radius>-0.0022</radius><thickness>-0.0003</thickness></launchlug>',
      'launchlug',
    );
    expect(n['length']).toBe(0);
    expect(n['outerRadius']).toBe(0);
    expect(n['thickness']).toBe(0);
  });

  it('floors a mass component, where the value IS the mass', () => {
    const n = nodeOfType(
      '<masscomponent><name>M</name><mass>-0.05</mass><packedlength>-0.02</packedlength><packedradius>-0.01</packedradius></masscomponent>',
      'masscomponent',
    );
    expect(n['mass']).toBe(0);
    expect(n['length']).toBe(0);
    expect(n['radius']).toBe(0);
  });

  it('takes a negative mass or CG override as desktop sets it', () => {
    // RocketComponent.setOverrideMass stores Math.max(m, 0) (RocketComponent.java:615)
    // and setOverrideCGX stores the value as given (RocketComponent.java:701).
    const n = nodeOfType(
      `<bodytube><name>B</name><length>0.3</length><radius>0.012</radius>
         <overridemass>-0.5</overridemass><overridecg>-0.1</overridecg>
       </bodytube>`,
      'bodytube',
    );
    expect(n['overrideMass']).toBe(Math.max(-0.5, 0));
    expect(n['overrideCGX']).toBe(-0.1);
  });

  it('keeps a negative Cd override, which RocketComponent.setOverrideCD accepts', () => {
    // Desktop does not clamp: a negative Cd offsets drag from the rest of the design.
    const n = nodeOfType(
      '<bodytube><name>B</name><length>0.3</length><radius>0.012</radius><overridecd>-0.25</overridecd></bodytube>',
      'bodytube',
    );
    expect(n['overrideCD']).toBe(-0.25);
    const again = flatten(
      importOrk(
        exportOrk({
          name: 'RT',
          tree: importOrk(
            ork(
              wrap(
                '<bodytube><name>B</name><length>0.3</length><radius>0.012</radius><overridecd>-0.25</overridecd></bodytube>',
              ),
            ),
          ).tree,
        }),
      ).tree.components,
    ).find((c) => c.type === 'bodytube');
    expect(again?.['overrideCD']).toBe(-0.25);
  });

  it('keeps a zero override, which is a real instruction', () => {
    const n = nodeOfType(
      '<bodytube><name>B</name><length>0.3</length><radius>0.012</radius><overridemass>0</overridemass></bodytube>',
      'bodytube',
    );
    expect(n['overrideMass']).toBe(0);
  });

  it('floors a deploy altitude, the same field the input floors', () => {
    const n = nodeOfType(
      '<parachute><name>P</name><diameter>0.3</diameter><deployevent>altitude</deployevent><deployaltitude>-200</deployaltitude></parachute>',
      'parachute',
    );
    expect(n['deployAltitude']).toBe(0);
  });

  it('leaves a valid design untouched', () => {
    const n = nodeOfType(
      '<bodytube><name>B</name><length>0.3</length><radius>0.024</radius><thickness>0.0015</thickness></bodytube>',
      'bodytube',
    );
    expect(n['length']).toBe(0.3);
    expect(n['outerRadius']).toBe(0.024);
    expect(n['thickness']).toBe(0.0015);
  });
});

describe('a <stage active="false"/> flag addresses a stage or is dropped', () => {
  // `Number(null)` and `Number('')` are 0, so a naive read grounds the sustainer.
  const twoStage = (flag: string) =>
    `<?xml version="1.0"?><openrocket version="1.8"><rocket><name>T</name>` +
    `<motorconfiguration configid="c1" default="true"><stage number="0" active="true"/>${flag}</motorconfiguration>` +
    `<subcomponents>` +
    `<stage><name>Sustainer</name><subcomponents><bodytube><name>B1</name><length>0.3</length><radius>0.012</radius></bodytube></subcomponents></stage>` +
    `<stage><name>Booster</name><subcomponents><bodytube><name>B2</name><length>0.2</length><radius>0.012</radius></bodytube></subcomponents></stage>` +
    `</subcomponents></rocket></openrocket>`;

  it('grounds the stage the flag names', () => {
    const res = importOrk(ork(twoStage('<stage number="1" active="false"/>')));
    const stages = res.tree.components.filter((c) => c.type === 'stage');
    expect(res.configs[0]!.grounded).toEqual([stages[1]!.id]);
  });

  it('drops a flag with no number rather than grounding the sustainer', () => {
    const res = importOrk(ork(twoStage('<stage active="false"/>')));
    expect(res.configs[0]!.grounded).toEqual([]);
  });

  it('drops a flag whose number is blank', () => {
    const res = importOrk(ork(twoStage('<stage number="" active="false"/>')));
    expect(res.configs[0]!.grounded).toEqual([]);
  });

  it('drops a flag whose number is not a number', () => {
    const res = importOrk(ork(twoStage('<stage number="nope" active="false"/>')));
    expect(res.configs[0]!.grounded).toEqual([]);
  });
});

describe('a .rkt cannot state a negative fin or wall dimension', () => {
  const rkt = (parts: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><RockSimDocument><FileVersion>4</FileVersion>
     <DesignInformation><RocketDesign><Name>C</Name><StageCount>1</StageCount><Stage3Parts>
       ${parts}
     </Stage3Parts></RocketDesign></DesignInformation></RockSimDocument>`;
  const of = (xml: string, type: string) => flatten(importRkt(xml).tree.components).find((n) => n.type === type)!;

  it('floors a trapezoid fin root, tip, span and thickness but keeps a negative sweep', () => {
    const fin = of(
      rkt(`<BodyTube><Name>B</Name><Len>300</Len><OD>24.8</OD><ID>21.6</ID><AttachedParts>
        <FinSet><Name>F</Name><ShapeCode>0</ShapeCode><FinCount>3</FinCount><Thickness>-3</Thickness>
          <RootChord>-50</RootChord><TipChord>-20</TipChord><SemiSpan>-40</SemiSpan><SweepDistance>-10</SweepDistance>
        </FinSet></AttachedParts></BodyTube>`),
      'trapezoidfinset',
    );
    expect(fin['thickness']).toBe(0);
    expect(fin['rootChord']).toBe(0);
    expect(fin['tipChord']).toBe(0);
    expect(fin['height']).toBe(0);
    expect(fin['sweep']).toBeCloseTo(-0.01, 12);
  });

  it('floors an elliptical fin root and span', () => {
    const fin = of(
      rkt(`<BodyTube><Name>B</Name><Len>300</Len><OD>24.8</OD><ID>21.6</ID><AttachedParts>
        <FinSet><Name>F</Name><ShapeCode>1</ShapeCode><RootChord>-50</RootChord><SemiSpan>-40</SemiSpan></FinSet>
        </AttachedParts></BodyTube>`),
      'ellipticalfinset',
    );
    expect(fin['rootChord']).toBe(0);
    expect(fin['height']).toBe(0);
  });

  it('floors a hollow nose cone wall', () => {
    const nose = of(
      rkt(`<NoseCone><Name>N</Name><Len>100</Len><BaseDia>24.8</BaseDia><ConstructionType>1</ConstructionType>
        <WallThickness>-2</WallThickness></NoseCone>`),
      'nosecone',
    );
    expect(nose['thickness']).toBe(0);
  });
});

describe('a RockSim <Color> is normalized or dropped', () => {
  const rkt = (color: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><RockSimDocument><FileVersion>4</FileVersion>
     <DesignInformation><RocketDesign><Name>C</Name><StageCount>1</StageCount><Stage3Parts>
       <BodyTube><Name>B</Name><Len>300</Len><OD>24.8</OD><ID>21.6</ID><Color>${color}</Color></BodyTube>
     </Stage3Parts></RocketDesign></DesignInformation></RockSimDocument>`;

  const colorOf = (raw: string): unknown => {
    const res = importRkt(rkt(raw));
    return flatten(res.tree.components).find((n) => n.type === 'bodytube')?.['color'];
  };

  it('keeps a hex value, normalized to the one spelling the app means', () => {
    expect(colorOf('#1A2B3C')).toBe('#1a2b3c');
    expect(colorOf('1a2b3c')).toBe('#1a2b3c');
    expect(colorOf('#ABC')).toBe('#aabbcc');
  });

  it('maps a basic color NAME, which is what RockSim writes', () => {
    expect(colorOf('Black')).toBe('#000000');
    expect(colorOf('red')).toBe('#ff0000');
  });

  it('drops anything no consumer can read', () => {
    expect(colorOf('chartreuse-ish')).toBeUndefined();
    expect(colorOf('url(#x)')).toBeUndefined();
    expect(colorOf('  ')).toBeUndefined();
  });
});

describe('the freeform point cap bounds what is BUILT, not just what is kept', () => {
  const rktWithPoints = (points: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><RockSimDocument><FileVersion>4</FileVersion>
     <DesignInformation><RocketDesign><Name>C</Name><StageCount>1</StageCount><Stage3Parts>
       <BodyTube><Name>B</Name><Len>300</Len><OD>24.8</OD><ID>21.6</ID><AttachedParts>
         <CustomFinSet><Name>F</Name><FinCount>3</FinCount><ShapeCode>2</ShapeCode><PointList>${points}</PointList></CustomFinSet>
       </AttachedParts></BodyTube>
     </Stage3Parts></RocketDesign></DesignInformation></RockSimDocument>`;

  const pointsOf = (raw: string): [number, number][] | undefined => {
    const res = importRkt(rktWithPoints(raw));
    return flatten(res.tree.components).find((n) => n.type === 'freeformfinset')?.['points'] as
      [number, number][] | undefined;
  };

  it('reads an ordinary outline unchanged', () => {
    expect(pointsOf('0,0|50,30|50,0')).toEqual([
      [0, 0],
      [0.05, 0.03],
      [0.05, 0],
    ]);
  });

  it('stops at the cap and says so, on a list past it', () => {
    const over = MAX_FIN_POINTS + 500;
    const many = Array.from({ length: over }, (_, i) => `${i},${i}`).join('|');
    const res = importRkt(rktWithPoints(many));
    const pts = flatten(res.tree.components).find((n) => n.type === 'freeformfinset')?.['points'] as
      [number, number][] | undefined;
    expect(pts).toHaveLength(MAX_FIN_POINTS);
    expect(noteTexts(res.notes).some((n) => n.includes('points'))).toBe(true);
  });

  it('skips a malformed pair without ending the scan', () => {
    expect(pointsOf('0,0|bogus|50,30|50,0')).toEqual([
      [0, 0],
      [0.05, 0.03],
      [0.05, 0],
    ]);
  });
});

describe('a .ork cannot state a negative separation altitude', () => {
  it('floors it on the stage the way deployment is floored', () => {
    const xml = `<?xml version="1.0"?><openrocket version="1.8"><rocket><name>T</name><subcomponents>
      <stage><name>S</name><subcomponents><bodytube><name>B</name><length>0.3</length><radius>0.012</radius></bodytube></subcomponents></stage>
      <stage><name>Booster</name><separationevent>altitude</separationevent><separationaltitude>-5</separationaltitude>
        <subcomponents><bodytube><name>BB</name><length>0.3</length><radius>0.012</radius></bodytube></subcomponents></stage>
    </subcomponents></rocket></openrocket>`;
    const booster = importOrk(ork(xml)).tree.components[1]!;
    expect(booster['separationAltitude']).toBe(0);
  });
});

// Mirrors desktop ORColor.fromXMLAttributes: three integer channels in 0-255, or no color.
describe('a .ork color needs every channel', () => {
  const colorOf = (attrs: string): unknown =>
    nodeOfType(
      `<bodytube><name>Body</name><length>0.3</length><radius>0.012</radius><color ${attrs}/></bodytube>`,
      'bodytube',
    )['color'];

  it('reads a complete color', () => {
    expect(colorOf('red="255" green="16" blue="0"')).toBe('#ff1000');
    expect(colorOf('red="1" green="2" blue="3" alpha="255"')).toBe('#010203');
  });

  it('reads no color when a channel is missing, fractional or out of range', () => {
    expect(colorOf('red="255"')).toBeUndefined();
    expect(colorOf('red="255" green="0"')).toBeUndefined();
    expect(colorOf('red="2.5" green="0" blue="0"')).toBeUndefined();
    expect(colorOf('red="300" green="0" blue="0"')).toBeUndefined();
    expect(colorOf('red="1" green="2" blue="3" alpha="x"')).toBeUndefined();
  });
});
