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
      tube('<subcomponents><parachute><name>C</name><diameter>0.3</diameter><material density="0.05">Nylon</material></parachute></subcomponents>'),
    ).children![0]!;
    expect(chute['surfaceDensity']).toBe(0.05);
    expect(chute['surfaceMaterialName']).toBe('Nylon');
    expect(chute.density).toBeUndefined();

    const cord = firstPart(
      tube('<subcomponents><shockcord><name>K</name><cordlength>1</cordlength><material density="0.002">Kevlar</material></shockcord></subcomponents>'),
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
    const n = firstPart('<nosecone><name>N</name><length>0.1</length><aftradius>0.012</aftradius><thickness>Filled</thickness></nosecone>');
    expect(n['filled']).toBe(true);
  });

  it('takes TRUE and FALSE on every boolean tag', () => {
    const nose = firstPart(`<nosecone><name>N</name><length>0.1</length><aftradius>0.012</aftradius><thickness>0.001</thickness>
      <isflipped>TRUE</isflipped><aftshouldercapped>True</aftshouldercapped><overridesubcomponentsmass>TRUE</overridesubcomponentsmass></nosecone>`);
    expect(nose['flipped']).toBe(true);
    expect(nose['shoulderCapped']).toBe(true);
    expect(nose['overrideSubcomponentsMass']).toBe(true);

    const transition = firstPart(`<transition><name>X</name><length>0.1</length><foreradius>0.012</foreradius><aftradius>0.01</aftradius>
      <thickness>0.001</thickness><shapeclipped>FALSE</shapeclipped></transition>`);
    expect(transition['clipped']).toBe(false);
  });

  it('takes AUTO as an automatic Cd', () => {
    const chute = firstPart(tube('<subcomponents><parachute><name>C</name><diameter>0.3</diameter><cd>AUTO</cd></parachute></subcomponents>')).children![0]!;
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
