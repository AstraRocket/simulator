import { describe, it, expect } from 'vitest';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import { C6 } from '../../../src/engine/api';
import { newFlightConfig, type FlightConfig } from '../../../src/services/flight/flightConfigs';
import { findNode } from '../../../src/services/design/treeEdit';
import { applyParams, optimizableParams, type OptParam } from '../../../src/services/flight/optimizer/optParams';

const stage = (id: string, children: ComponentNode[]): ComponentNode => ({ type: 'stage', id, children });

const sustainer = (): ComponentNode =>
  stage('s1', [
    { type: 'nosecone', id: 'nose', length: 0.1, aftRadius: 0.0125, aftRadiusAuto: false, cant: 0.01 },
    {
      type: 'bodytube',
      id: 'body',
      length: 0.3,
      outerRadius: 0.0125,
      outerRadiusAuto: true,
      thickness: 0.001,
      motorMount: true,
      children: [
        {
          type: 'trapezoidfinset',
          id: 'fins',
          rootChord: 0.05,
          tipChord: 0.03,
          sweep: 0.02,
          height: 0.04,
          cant: 0.01,
          position: { method: 'bottom', offset: 0 },
        },
        {
          type: 'parachute',
          id: 'chute',
          diameter: 0.3,
          cd: 0.8,
          length: 0.05,
          deployEvent: 'altitude',
          deployAltitude: 150,
          position: { method: 'top', offset: 0.02 },
        },
        { type: 'launchlug', id: 'lug', length: 0.03, outerRadius: 0.002 },
      ],
    },
  ]);

const single = (): RocketTree => ({ components: [sustainer()] });
const ids = (ps: OptParam[]) => ps.map((p) => p.id);
const one = (ps: OptParam[], id: string) => ps.find((p) => p.id === id) as OptParam;

describe('optimizer parameters', () => {
  const config = newFlightConfig({ body: { spec: C6 } });

  it('offers the design choices and leaves out what no goal can use', () => {
    const got = ids(optimizableParams(single(), config));
    expect(got).toEqual([
      'nose:length',
      'nose:baseDiameter',
      'body:length',
      'body:motorOverhang',
      'fins:rootChord',
      'fins:tipChord',
      'fins:sweep',
      'fins:height',
      'fins:position',
      'chute:chuteDiameter',
      'chute:position',
      'chute:deployDelay',
      'chute:deployAltitude',
    ]);
    // No cant, wall thickness, drag coefficient, launch lug or automatic diameter.
    expect(got.some((id) => /cant|thickness|cd|lug|body:outerDiameter/.test(id))).toBe(false);
  });

  it("starts from desktop's ranges, and keeps a position on its parent", () => {
    const ps = optimizableParams(single(), config);
    expect(one(ps, 'nose:length')).toMatchObject({ current: 0.1, min: 0.05, max: 0.2 });
    expect(one(ps, 'nose:baseDiameter')).toMatchObject({ current: 0.025, min: 0.0125, max: 0.05 });
    expect(one(ps, 'chute:deployDelay')).toMatchObject({ min: 0, max: 10 });
    expect(one(ps, 'fins:position').min).toBeCloseTo(-0.25);
    expect(one(ps, 'fins:position').max).toBe(0);
    expect(one(ps, 'chute:position').min).toBe(0);
    expect(one(ps, 'chute:position').max).toBeCloseTo(0.25);
  });

  it('offers a deployment altitude only for a device that deploys at one', () => {
    const tree = single();
    const chute = findNode(tree, 'chute') as ComponentNode;
    chute['deployEvent'] = 'apogee';
    expect(ids(optimizableParams(tree, config))).not.toContain('chute:deployAltitude');
  });

  it('sets a diameter as the radius the part stores, through the same edit path as the editor', () => {
    const ps = optimizableParams(single(), config);
    const p = one(ps, 'nose:baseDiameter');
    const { tree } = applyParams(single(), config, [p], [0.04]);
    expect(findNode(tree, 'nose')?.['aftRadius']).toBe(0.02);
    // The automatic body tube follows, as it would after a manual edit.
    expect(findNode(tree, 'body')?.['outerRadius']).toBeCloseTo(0.02);
  });

  it('sets a deployment the configuration overrides in that configuration, not the part', () => {
    const over: FlightConfig = { ...config, deployments: { chute: { deployEvent: 'altitude', deployAltitude: 300 } } };
    const p = one(optimizableParams(single(), over), 'chute:deployAltitude');
    expect(p.current).toBe(300);
    const done = applyParams(single(), over, [p], [250]);
    expect(done.config.deployments?.['chute']?.deployAltitude).toBe(250);
    expect(findNode(done.tree, 'chute')?.['deployAltitude']).toBe(150);
  });

  it('offers an ignition delay for an upper stage motor only, set in the configuration', () => {
    const booster = stage('s2', [
      { type: 'bodytube', id: 'boost', length: 0.2, outerRadius: 0.0125, motorMount: true },
    ]);
    const tree: RocketTree = { components: [sustainer(), booster] };
    const cfg = newFlightConfig({ body: { spec: C6 }, boost: { spec: C6 } });
    const ps = optimizableParams(tree, cfg);
    expect(ids(ps)).toContain('body:ignitionDelay');
    expect(ids(ps)).not.toContain('boost:ignitionDelay');
    const done = applyParams(tree, cfg, [one(ps, 'body:ignitionDelay')], [1.5]);
    expect(done.config.motors['body']).toMatchObject({ ignitionEvent: 'automatic', ignitionDelay: 1.5 });
  });

  it('leaves out the parts of a grounded stage', () => {
    const booster = stage('s2', [{ type: 'bodytube', id: 'boost', length: 0.2, outerRadius: 0.0125 }]);
    const tree: RocketTree = { components: [sustainer(), booster] };
    const cfg = { ...newFlightConfig({ body: { spec: C6 } }), grounded: ['s2'] };
    expect(ids(optimizableParams(tree, cfg)).some((id) => id.startsWith('boost:'))).toBe(false);
  });
});
