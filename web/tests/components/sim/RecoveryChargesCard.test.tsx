// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { useWorkspaceStore } from '../../../src/state/store';
import { RecoveryChargesCard } from '../../../src/components/sim/RecoveryChargesCard';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';

const at = (offset: number) => ({ method: 'top', offset });

const chute = { id: 'chute', type: 'parachute', length: 0.05, position: at(0.1) } as unknown as ComponentNode;

function seed(inside: ComponentNode[] = []): void {
  useWorkspaceStore.setState({
    tree: {
      components: [
        {
          id: 'st',
          type: 'stage',
          children: [
            {
              id: 'tube',
              type: 'bodytube',
              name: 'Upper',
              length: 0.6,
              outerRadius: 0.04,
              thickness: 0.001,
              children: [chute, ...inside],
            },
          ],
        },
      ],
    } as unknown as RocketTree,
  });
}

const charge = (id: string, name: string, mass: number) =>
  ({ id, type: 'masscomponent', name, mass, position: at(0) }) as unknown as ComponentNode;

describe('the Results card of recovery charges', () => {
  it('lists the saved charges', () => {
    seed([charge('c1', 'Main charge', 0.0012), charge('c2', 'Main backup charge', 0.0018)]);
    renderWithProviders(<RecoveryChargesCard />);
    const row = screen.getByRole('rowheader', { name: 'Main' }).closest('tr')!;
    expect(row.textContent).toMatch(/Upper.*1\.20.*1\.80/);
  });

  it('counts charges kept in an inner tube for the body tube around it', () => {
    seed([
      {
        id: 'holder',
        type: 'innertube',
        length: 0.2,
        outerRadius: 0.035,
        position: at(0.05),
        children: [charge('c1', 'Main charge', 0.0012), charge('c2', 'Main backup charge', 0.0018)],
      } as unknown as ComponentNode,
    ]);
    renderWithProviders(<RecoveryChargesCard />);
    const row = screen.getByRole('rowheader', { name: 'Main' }).closest('tr')!;
    expect(row.textContent).toMatch(/Upper.*1\.20.*1\.80/);
  });

  it('gives each of two main bays its own row', () => {
    useWorkspaceStore.setState({
      tree: {
        components: [
          {
            id: 'st',
            type: 'stage',
            children: ['Upper', 'Main'].map((name, i) => ({
              id: `t${i}`,
              type: 'bodytube',
              name,
              length: 0.6,
              outerRadius: 0.04,
              children: [
                charge(`p${i}`, 'Main charge', 0.004 + i * 0.001),
                charge(`b${i}`, 'Main backup charge', 0.0045 + i * 0.001),
              ],
            })),
          },
        ],
      } as unknown as RocketTree,
    });
    renderWithProviders(<RecoveryChargesCard />);
    const rows = screen.getAllByRole('rowheader', { name: 'Main' }).map((h) => h.closest('tr')!.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/Upper.*4\.00.*4\.50/);
    expect(rows[1]).toMatch(/Main.*5\.00.*5\.50/);
  });

  it('names the stage of each bay when there is more than one stage', () => {
    const stage = (id: string, name: string | undefined, mass: number) => ({
      id,
      type: 'stage',
      ...(name ? { name } : {}),
      children: [
        {
          id: `${id}-tube`,
          type: 'bodytube',
          name: 'Body tube',
          length: 0.6,
          outerRadius: 0.04,
          children: [charge(`${id}-c`, 'Main charge', mass)],
        },
      ],
    });
    useWorkspaceStore.setState({
      tree: {
        components: [stage('s1', 'Sustainer', 0.004), stage('s2', undefined, 0.005)],
      } as unknown as RocketTree,
    });
    renderWithProviders(<RecoveryChargesCard />);
    const rows = screen.getAllByRole('rowheader', { name: 'Main' }).map((h) => h.closest('tr')!.textContent);
    expect(rows[0]).toMatch(/Sustainer · Body tube.*4\.00/);
    expect(rows[1]).toMatch(/Stage · Body tube.*5\.00/);
  });

  it('shows nothing for a design with no charges', () => {
    seed();
    renderWithProviders(<RecoveryChargesCard />);
    expect(screen.queryByText('Recovery charges')).toBeNull();
  });
});
