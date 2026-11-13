// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { importOrk } from '../../../src/services/files/orkFile';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';

const ork = (rocket: string, parts: string): string => `<?xml version='1.0' encoding='utf-8'?>
<openrocket version="1.10" creator="test"><rocket><name>R</name>${rocket}
  <subcomponents><stage><name>S</name><subcomponents>${parts}</subcomponents></stage></subcomponents>
</rocket></openrocket>`;

const firstPart = (parts: string): ComponentNode => importOrk(ork('', parts)).tree.components[0]!.children![0]!;

const tube = (inner: string) =>
  `<bodytube><name>T</name><length>0.2</length><radius>0.012</radius><thickness>0.001</thickness>${inner}</bodytube>`;

describe('a <material> with no type, as MaterialSetter reads it', () => {
  it('is bulk on a structural part', () => {
    const n = firstPart(tube('<material density="500" group="WOODS">Custom wood</material>'));
    expect(n.density).toBe(500);
    expect(n['materialName']).toBe('Custom wood');
    expect(n['materialGroup']).toBe('WOODS');
  });

  it('is surface on a parachute and line on a shock cord, never bulk', () => {
    const chute = firstPart(
      tube(
        '<subcomponents><parachute><name>C</name><diameter>0.3</diameter><material density="0.05">Nylon</material></parachute></subcomponents>',
      ),
    ).children![0]!;
    expect(chute['surfaceDensity']).toBe(0.05);
    expect(chute['surfaceMaterialName']).toBe('Nylon');
    expect(chute.density).toBeUndefined();

    const cord = firstPart(
      tube(
        '<subcomponents><shockcord><name>K</name><cordlength>1</cordlength><material density="0.002">Kevlar</material></shockcord></subcomponents>',
      ),
    ).children![0]!;
    expect(cord['lineDensity']).toBe(0.002);
    expect(cord.density).toBeUndefined();
  });

  it('still ignores a stated type of the wrong kind', () => {
    const n = firstPart(tube('<material type="surface" density="500">Cloth</material>'));
    expect(n.density).toBeUndefined();
    expect(n['materialName']).toBeUndefined();
  });
});

describe('case in special words, as BooleanSetter and DoubleSetter read it', () => {
  it('takes Filled as filled', () => {
    const n = firstPart(
      '<nosecone><name>N</name><length>0.1</length><aftradius>0.012</aftradius><thickness>Filled</thickness></nosecone>',
    );
    expect(n['filled']).toBe(true);
  });

  it('takes TRUE and FALSE on every boolean tag', () => {
    const nose =
      firstPart(`<nosecone><name>N</name><length>0.1</length><aftradius>0.012</aftradius><thickness>0.001</thickness>
      <isflipped>TRUE</isflipped><aftshouldercapped>True</aftshouldercapped><overridesubcomponentsmass>TRUE</overridesubcomponentsmass></nosecone>`);
    expect(nose['flipped']).toBe(true);
    expect(nose['shoulderCapped']).toBe(true);
    expect(nose['overrideSubcomponentsMass']).toBe(true);

    const transition =
      firstPart(`<transition><name>X</name><length>0.1</length><foreradius>0.012</foreradius><aftradius>0.01</aftradius>
      <thickness>0.001</thickness><shapeclipped>FALSE</shapeclipped></transition>`);
    expect(transition['clipped']).toBe(false);
  });

  it('takes AUTO as an automatic Cd', () => {
    const chute = firstPart(
      tube('<subcomponents><parachute><name>C</name><diameter>0.3</diameter><cd>AUTO</cd></parachute></subcomponents>'),
    ).children![0]!;
    expect(chute['cdAuto']).toBe(true);
  });
});

describe('a motor whose configid nothing declares, as MotorMountHandler reads it', () => {
  const motor = (id: string, designation: string) =>
    `<motor configid="${id}"><designation>${designation}</designation><delay>5</delay></motor>`;
  const mount = (motors: string) => tube(`<motormount>${motors}</motormount>`);

  it('creates its configuration after the declared ones, and the declared default still opens', () => {
    const res = importOrk(
      ork('<motorconfiguration configid="a" default="true"/>', mount(motor('a', 'C6') + motor('b', 'D12'))),
    );
    expect(res.configs.map((c) => c.id)).toEqual(['a', 'b']);
    expect(res.chosenConfigId).toBe('a');
    const id = res.tree.components[0]!.children![0]!.id!;
    expect(res.configs[1]!.motors[id]!.designation).toBe('D12');
    expect(res.configs[1]!.isDefault).toBe(false);
  });

  it('refuses a file past the configuration cap rather than dropping motors', () => {
    const motors = Array.from({ length: 257 }, (_, i) => motor(`m${i}`, 'C6')).join('');
    expect(() => importOrk(ork('', mount(motors)))).toThrow();
  });
});

describe('an unreadable configuration number, as desktop parseDouble leaves it', () => {
  const chute = (inner: string) =>
    tube(`<subcomponents><parachute><name>C</name><diameter>0.3</diameter><deployevent>altitude</deployevent>
      <deployaltitude>150</deployaltitude><deploydelay>2</deploydelay>${inner}</parachute></subcomponents>`);

  it('keeps the part own deployment rather than resetting it to the default', () => {
    const res = importOrk(
      ork(
        '<motorconfiguration configid="a" default="true"/>',
        chute(
          '<deploymentconfiguration configid="a"><deployaltitude>abc</deployaltitude><deploydelay></deploydelay></deploymentconfiguration>',
        ),
      ),
    );
    const n = res.tree.components[0]!.children![0]!.children![0]!;
    expect(n['deployAltitude']).toBe(150);
    const override = res.configs[0]!.deployments[n.id!];
    expect(override?.deployAltitude ?? 150).toBe(150);
    expect(override?.deployDelay ?? 2).toBe(2);
  });

  it('keeps the mount ignition delay for an unreadable configuration delay', () => {
    const res = importOrk(
      ork(
        '<motorconfiguration configid="a" default="true"/>',
        tube(`<motormount><ignitiondelay>1.5</ignitiondelay>
          <motor configid="a"><designation>C6</designation><delay>5</delay></motor>
          <ignitionconfiguration configid="a"><ignitiondelay>x</ignitiondelay></ignitionconfiguration></motormount>`),
      ),
    );
    const id = res.tree.components[0]!.children![0]!.id!;
    expect(res.configs[0]!.motors[id]!.ignitionDelay).toBe(1.5);
  });
});

describe('fin tab positions, as FinTabPositionSetter replays them', () => {
  const fins = (tabs: string) =>
    tube(`<subcomponents><trapezoidfinset><name>F</name><fincount>3</fincount><rootchord>0.1</rootchord>
      <tipchord>0.05</tipchord><height>0.05</height><thickness>0.003</thickness>
      <tabheight>0.01</tabheight><tablength>0.04</tablength>${tabs}</trapezoidfinset></subcomponents>`);
  const fin = (tabs: string) => firstPart(fins(tabs)).children![0]!;

  it('takes the last valid entry as written', () => {
    const n = fin('<tabposition relativeto="front">0.01</tabposition><tabposition relativeto="top">0.01</tabposition>');
    expect(n['tabOffsetMethod']).toBe('top');
    expect(n['tabOffset']).toBe(0.01);
  });

  it('rebases an earlier position when a later offset is unreadable', () => {
    const n = fin('<tabposition relativeto="top">0.01</tabposition><tabposition relativeto="bottom">abc</tabposition>');
    expect(n['tabOffsetMethod']).toBe('bottom');
    // Front edge 0.01 on a 0.1 root with a 0.04 tab: 0.05 short of the aft-aligned 0.06.
    expect(n['tabOffset']).toBeCloseTo(-0.05, 12);
  });

  it('ignores a missing or wrong-case method, keeping the earlier one', () => {
    const n = fin(
      '<tabposition relativeto="top">0.02</tabposition><tabposition relativeto="Bottom">0.03</tabposition><tabposition>0.04</tabposition>',
    );
    expect(n['tabOffsetMethod']).toBe('top');
    expect(n['tabOffset']).toBe(0.02);
  });
});

describe('a fillet material, as MaterialSetter reads it', () => {
  const fillet = (material: string) =>
    firstPart(
      tube(`<subcomponents><trapezoidfinset><name>F</name><rootchord>0.1</rootchord><tipchord>0.05</tipchord>
        <height>0.05</height><thickness>0.003</thickness><filletradius>0.005</filletradius>${material}</trapezoidfinset></subcomponents>`),
    ).children![0]!;

  it('takes a bulk or untyped one', () => {
    expect(fillet('<filletmaterial density="1100">Epoxy</filletmaterial>')['filletDensity']).toBe(1100);
  });

  it('ignores one stated as surface or line', () => {
    const n = fillet('<filletmaterial type="surface" density="1100">Cloth</filletmaterial>');
    expect(n['filletDensity']).toBeUndefined();
    expect(n['filletMaterialName']).toBeUndefined();
  });
});
