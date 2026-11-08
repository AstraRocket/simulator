// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { RecoverySizingReadout } from '../../../src/components/design/RecoverySizingReadout';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { useWorkspaceStore, selectActive } from '../../../src/state/store';
import { asFlown } from '../../testing/flown';
import type { ComponentNode, FlightResult, RocketTree } from '../../../src/engine/openRocketEngine';

const CHUTE = { id: 'chute', type: 'parachute', name: 'Main', diameter: 0.5, cd: 0.8 } as unknown as ComponentNode;

const TREE = {
  name: 'R',
  components: [
    {
      id: 'st',
      type: 'stage',
      name: 'Sustainer',
      children: [
        {
          id: 'tube',
          type: 'bodytube',
          length: 0.4,
          outerRadius: 0.026,
          thickness: 0.001,
          motorMount: true,
          children: [CHUTE],
        },
      ],
    },
  ],
} as unknown as RocketTree;

const INFO = { mass: 0.6, cg: 0.3, cp: 0.4, length: 0.5 } as never;

const CONFIG = {
  id: 'c1',
  name: 'C6',
  motors: { tube: { spec: { designation: 'C6', masses: [0.024, 0.011] } } },
} as never;

const RESULT = (branchName: string): FlightResult =>
  ({
    summary: {},
    events: [
      { type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 5, source: 'Main' },
      { type: 'GROUND_HIT', time: 25 },
    ],
    series: { time: [0, 5, 25], mass: [0.6, 0.44, 0.44], velocity: [0, -2, -5.5] },
    ...(branchName
      ? {
          branches: [
            {
              name: branchName,
              events: [
                { type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 5, source: 'Main' },
                { type: 'GROUND_HIT', time: 25 },
              ],
              series: { time: [0, 5, 25], mass: [0.6, 0.44, 0.44], velocity: [0, -2, -5.5] },
            },
            { name: 'Booster', events: [], series: { time: [0], mass: [0.2], velocity: [0] } },
          ],
        }
      : {}),
  }) as unknown as FlightResult;

function seed(opts: { result?: FlightResult | null; outdated?: boolean } = {}): void {
  const s = useWorkspaceStore.getState();
  const [first] = s.sims;
  useWorkspaceStore.setState({
    tree: TREE,
    info: INFO,
    configs: [CONFIG],
    sims: [{ ...first!, configId: 'c1', result: opts.result ?? null, resultKey: undefined }],
  });
  // A row with no `resultKey` reads outdated.
  if (!opts.outdated) {
    useWorkspaceStore.setState((st) => ({ sims: st.sims.map((x) => asFlown(st, x)) }));
  }
  useWorkspaceStore.setState({ activeId: selectActive(useWorkspaceStore.getState()).id });
}

const body = () => document.body.textContent ?? '';

function open(node: ComponentNode, onChange: (p: Partial<ComponentNode>) => void = () => {}): void {
  renderWithProviders(<RecoverySizingReadout node={node} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Descent sizing…' }));
}

describe('the descent-sizing block', () => {
  beforeEach(() => seed());

  it('says the figures are estimated when nothing has flown', () => {
    open(CHUTE);
    expect(body()).toMatch(/Estimated for a descent mass/);
    expect(body()).not.toMatch(/Measured in the last run/);
  });

  it('always marks the suggested diameters as estimates', () => {
    open(CHUTE);
    expect(body()).toMatch(/Diameters are estimates to design against/);
  });

  it('reports the kernel figures once the device has flown', () => {
    seed({ result: RESULT('') });
    open(CHUTE);
    expect(body()).toMatch(/Measured in the last run/);
    expect(screen.getByText(/440/)).toBeTruthy();
    expect(body()).toMatch(/5\.5/);
  });

  it('names the branch when the flight had more than one', () => {
    seed({ result: RESULT('Sustainer') });
    open(CHUTE);
    expect(body()).toMatch(/Measured in the last run on Sustainer/);
  });

  it('falls back to the estimate when the run is outdated', () => {
    seed({ result: RESULT(''), outdated: true });
    open(CHUTE);
    expect(body()).toMatch(/Estimated for a descent mass/);
  });

  it('stays an estimate for a device the run never deployed', () => {
    seed({ result: RESULT('') });
    const other = { ...CHUTE, id: 'other', name: 'Drogue' } as unknown as ComponentNode;
    open(other);
    expect(body()).toMatch(/Estimated for a descent mass/);
  });

  it('opens as a dialog, and sets a suggested diameter on the canopy', () => {
    const patches: Partial<ComponentNode>[] = [];
    open(CHUTE, (p) => patches.push(p));
    expect(screen.getByRole('dialog', { name: 'Descent sizing' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use the main diameter' }));
    expect(patches).toHaveLength(1);
    expect((patches[0] as { diameter: number }).diameter).toBeGreaterThan(0.5);
  });
});
