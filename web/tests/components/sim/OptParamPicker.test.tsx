// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { OptParamPicker, type ParamPick } from '../../../src/components/sim/OptParamPicker';
import type { RocketTree } from '../../../src/engine/openRocketEngine';
import { C6 } from '../../../src/engine/api';
import { newFlightConfig } from '../../../src/services/flight/flightConfigs';
import { optimizableParams } from '../../../src/services/flight/optimizer/optParams';

const tree: RocketTree = {
  components: [
    {
      type: 'stage',
      id: 's1',
      children: [
        { type: 'nosecone', id: 'nose', name: 'Nose', length: 0.1, aftRadius: 0.0125, aftRadiusAuto: false },
        {
          type: 'bodytube',
          id: 'body',
          name: 'Body',
          length: 0.3,
          outerRadius: 0.0125,
          motorMount: true,
          children: [
            { type: 'parachute', id: 'chute', name: 'Chute', diameter: 0.3, position: { method: 'top', offset: 0 } },
          ],
        },
      ],
    },
  ],
};
const params = optimizableParams(tree, newFlightConfig({ body: { spec: C6 } }));

function Harness() {
  const [picks, setPicks] = useState<ParamPick[]>([]);
  return <OptParamPicker tree={tree} params={params} picks={picks} setPicks={setPicks} disabled={false} />;
}

const available = () => screen.getByRole('list', { name: 'Available parameters' });
const picked = () => screen.getByRole('table', { name: 'Parameters to optimize' });

describe('optimizer parameter picker', () => {
  it('lists each part with its parameters under it, as the design tree nests them', () => {
    renderWithProviders(<Harness />);
    const list = within(available());
    expect(list.getByText('Nose')).toBeTruthy();
    expect(list.getByText('Chute')).toBeTruthy();
    // The nose has no parts under it, so its parameters sit right under it.
    expect(list.getByRole('button', { name: 'Base diameter' })).toBeTruthy();
    // The body tube has a part under it, so its own parameters wait in a shut group, as on desktop.
    const group = list.getByRole('button', { name: 'Optimization parameters' });
    expect(group.getAttribute('aria-expanded')).toBe('false');
    expect(list.queryByRole('button', { name: 'Motor overhang' })).toBeNull();
    fireEvent.click(group);
    expect(list.getByRole('button', { name: 'Motor overhang' })).toBeTruthy();
  });

  it('adds a parameter by double click, or by picking it and pressing Add, and grays it out in the tree', () => {
    renderWithProviders(<Harness />);
    const list = within(available());
    expect(within(picked()).getByText(/None yet/)).toBeTruthy();

    fireEvent.doubleClick(list.getByRole('button', { name: 'Base diameter' }));
    expect(within(picked()).getByRole('rowheader', { name: 'Nose · Base diameter' })).toBeTruthy();
    expect(list.getByRole('button', { name: 'Base diameter' }).getAttribute('title')).toBe(
      'Already in the list to optimize',
    );

    const add = screen.getByRole('button', { name: '↑ Add' });
    expect(add.hasAttribute('disabled')).toBe(true);
    fireEvent.click(list.getAllByRole('button', { name: 'Diameter' })[0]!);
    expect(add.hasAttribute('disabled')).toBe(false);
    fireEvent.click(add);
    expect(within(picked()).getByRole('rowheader', { name: 'Chute · Diameter' })).toBeTruthy();
    // Added once only, however often it is asked for.
    fireEvent.doubleClick(list.getByRole('button', { name: 'Base diameter' }));
    expect(within(picked()).getAllByRole('rowheader')).toHaveLength(2);
  });

  it('removes the selected rows, or all of them', () => {
    renderWithProviders(<Harness />);
    const list = within(available());
    fireEvent.doubleClick(list.getByRole('button', { name: 'Length' }));
    fireEvent.doubleClick(list.getByRole('button', { name: 'Base diameter' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Nose · Length' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(
      within(picked())
        .getAllByRole('rowheader')
        .map((r) => r.textContent),
    ).toEqual(['Nose · Base diameter']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove all' }));
    expect(within(picked()).queryAllByRole('rowheader')).toHaveLength(0);
  });
});
