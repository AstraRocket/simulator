// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

import { OtherMountsOffer } from '../../../src/components/config/OtherMountsOffer';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { useWorkspaceStore } from '../../../src/state/store';
import { newFlightConfig } from '../../../src/services/flight/flightConfigs';
import type { ComponentNode, MotorSpec, RocketTree } from '../../../src/engine/openRocketEngine';

const st = () => useWorkspaceStore.getState();
const node = (o: object) => o as unknown as ComponentNode;
const spec = (designation: string): MotorSpec =>
  ({ designation, diameter: 0.029, length: 0.124, ejectionDelay: 7 }) as unknown as MotorSpec;
const tube = (id: string, name: string) =>
  node({ type: 'innertube', id, name, motorMount: true, outerRadius: 0.0155, thickness: 0.0005, length: 0.2 });
const tree = {
  components: [
    node({
      type: 'stage',
      id: 'st',
      children: [
        node({ type: 'bodytube', id: 'bt', children: [tube('a', 'MMT A'), tube('b', 'MMT B'), tube('c', 'MMT C')] }),
      ],
    }),
  ],
} as unknown as RocketTree;

describe('OtherMountsOffer', () => {
  let configId: string;
  beforeEach(() => {
    st().resetWorkspace();
    const config = newFlightConfig({ a: { spec: spec('H128W') }, b: { spec: spec('G80'), ignitionDelay: 2 } });
    configId = config.id;
    useWorkspaceStore.setState({ tree, configs: [config], selectedConfigId: config.id });
  });

  const render = (onDone = () => {}) =>
    renderWithProviders(<OtherMountsOffer pending={{ configId, fromId: 'a', spec: spec('H128W') }} onDone={onDone} />);

  it('lists the other mounts and what each holds now', () => {
    render();
    expect(screen.getByText(/MMT B, replacing G80-7/)).toBeTruthy();
    expect(screen.getByText(/MMT C, empty now/)).toBeTruthy();
  });

  it('loads them as one undo step, each keeping its ignition, and Undo puts back what they had', () => {
    render();
    const past = st().past.length;
    fireEvent.click(screen.getByRole('button', { name: 'Load them' }));
    const motors = () => st().configs[0]!.motors;
    expect(st().past).toHaveLength(past + 1);
    expect(motors().b!.spec.designation).toBe('H128W');
    expect(motors().b!.ignitionDelay).toBe(2);
    expect(motors().c!.spec.designation).toBe('H128W');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(motors().b!.spec.designation).toBe('G80');
    expect(motors().c).toBeUndefined();
  });

  it('is gone once the picked mount no longer holds the pick', () => {
    st().setMountMotor(configId, 'a', spec('G80'));
    const { container } = render();
    expect(container.textContent).toBe('');
  });
});
