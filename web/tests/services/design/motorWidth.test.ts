import { describe, it, expect } from 'vitest';
import { tooWideMotors } from '../../../src/services/design/motorWidth';
import { newFlightConfig } from '../../../src/services/flight/flightConfigs';
import type { ComponentNode, MotorSpec, RocketTree } from '../../../src/engine/openRocketEngine';

const node = (o: object) => o as unknown as ComponentNode;
const spec = (designation: string, diameter: number, length = 0.124): MotorSpec =>
  ({ designation, diameter, length }) as unknown as MotorSpec;
// A 30 mm bore, 200 mm long; `narrow` is a 24 mm bore.
const tube = (id: string, o: object = {}) =>
  node({ type: 'innertube', id, motorMount: true, outerRadius: 0.0155, thickness: 0.0005, length: 0.2, ...o });

const tree = {
  components: [
    node({
      type: 'stage',
      id: 's',
      children: [
        node({
          type: 'bodytube',
          id: 'bt',
          children: [tube('wide'), tube('narrow', { outerRadius: 0.0125 }), tube('short', { length: 0.05 })],
        }),
      ],
    }),
  ],
} as unknown as RocketTree;

describe('tooWideMotors', () => {
  it('lists a motor wider than its mount, in any configuration, once per mount and motor', () => {
    const configs = [
      newFlightConfig({ narrow: { spec: spec('H128W', 0.029) }, wide: { spec: spec('H128W', 0.029) } }),
      newFlightConfig({ narrow: { spec: spec('H128W', 0.029) } }),
      newFlightConfig({ narrow: { spec: spec('J350W', 0.038) } }),
    ];
    expect(tooWideMotors(tree, configs).map((w) => [w.node.id, w.designation, w.diameter, w.bore])).toEqual([
      ['narrow', 'H128W', 29, 24],
      ['narrow', 'J350W', 38, 24],
    ]);
  });

  it('leaves a motor within the picker tolerance, a long motor and an unidentified one alone', () => {
    const configs = [
      newFlightConfig({
        wide: { spec: spec('H', 0.0305) },
        short: { spec: spec('I', 0.029, 0.6) },
        narrow: { spec: spec('', 0.029) },
      }),
    ];
    expect(tooWideMotors(tree, configs)).toEqual([]);
  });
});
