// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { FinFlutterReadout } from '../../../src/components/design/FinFlutterReadout';
import { chooseFinStock, forgetFinStockChoices, stockModulus } from '../../../src/state/finFlutterChoices';
import { FlightWarnings } from '../../../src/components/sim/FlightWarnings';
import { SimulationsTable } from '../../../src/components/sim/SimulationsTable';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { useWorkspaceStore, selectActive } from '../../../src/state/store';
import { asFlown } from '../../testing/flown';
import type { ComponentNode, FlightResult, RocketTree } from '../../../src/engine/openRocketEngine';

// G10 flutters near 231 m/s at sea level on this fin.
const fin = (materialName: string) =>
  ({
    id: 'fins',
    type: 'trapezoidfinset',
    finCount: 3,
    rootChord: 0.15,
    tipChord: 0.05,
    sweep: 0.05,
    height: 0.1,
    thickness: 0.003175,
    materialName,
  }) as unknown as ComponentNode;

const tree = (node: ComponentNode) =>
  ({
    name: 'R',
    components: [
      {
        id: 'st',
        type: 'stage',
        name: 'Sustainer',
        children: [
          { id: 'tube', type: 'bodytube', length: 0.6, outerRadius: 0.04, thickness: 0.001, children: [node] },
        ],
      },
    ],
  }) as unknown as RocketTree;

const flight = (top: number): FlightResult =>
  ({
    summary: {},
    events: [],
    series: { time: [0, 1, 2], altitude: [0, 100, 500], velocity: [0, top, top / 2] },
  }) as unknown as FlightResult;

function seed(node: ComponentNode, result: FlightResult | null, outdated = false): void {
  const [first] = useWorkspaceStore.getState().sims;
  useWorkspaceStore.setState({
    tree: tree(node),
    sims: [{ ...first!, result, resultKey: undefined, launch: { ...first!.launch, launchAltitudeM: 0 } }],
  });
  if (!outdated) useWorkspaceStore.setState((st) => ({ sims: st.sims.map((x) => asFlown(st, x)) }));
  useWorkspaceStore.setState({ activeId: selectActive(useWorkspaceStore.getState()).id });
}

const body = () => document.body.textContent ?? '';

function open(node: ComponentNode): void {
  renderWithProviders(<FinFlutterReadout node={node} />);
  fireEvent.click(screen.getByRole('button', { name: 'Fin flutter…' }));
}

describe("a fin set's flutter check", () => {
  beforeEach(() => forgetFinStockChoices());

  it('takes the stiffness from a material it knows, and reads the margin against the run', () => {
    const node = fin('Fiberglass');
    seed(node, flight(150));
    open(node);
    expect((screen.getByLabelText('Fin stock') as HTMLSelectElement).value).toBe('g10');
    expect(body()).toMatch(/Flutter speed at the pad/);
    expect(body()).toMatch(/At least/);
    expect(body()).toMatch(/Closest at 1(\.00)? s/);
  });

  it('says when the flight goes past the flutter speed', () => {
    const node = fin('Fiberglass');
    seed(node, flight(300));
    open(node);
    expect(body()).toMatch(/goes faster than/);
  });

  it('asks for a shear modulus for a material it has no figure for', () => {
    const node = fin('Cardboard');
    seed(node, flight(150));
    open(node);
    expect((screen.getByLabelText('Fin stock') as HTMLSelectElement).value).toBe('custom');
    expect(body()).toMatch(/no typical value for Cardboard/);
    expect(body()).not.toMatch(/Flutter speed at the pad/);
    fireEvent.change(screen.getByLabelText('Fin stock'), { target: { value: 'g10' } });
    expect(body()).toMatch(/At least/);
  });

  it('asks for a run when there is none, and for a new one when it is outdated', () => {
    const node = fin('Fiberglass');
    seed(node, null);
    open(node);
    expect(body()).toMatch(/Run the simulation to read the margin/);
  });

  it('does not read the margin against an outdated run', () => {
    const node = fin('Fiberglass');
    seed(node, flight(300), true);
    open(node);
    expect(body()).toMatch(/last run is out of date/);
    expect(body()).not.toMatch(/goes faster than/);
  });
});

describe('the flutter flight warning', () => {
  beforeEach(() => forgetFinStockChoices());

  const shown = () => selectActive(useWorkspaceStore.getState());

  it('leads the flight warnings when the run goes past the flutter speed, named serious', () => {
    const node = fin('Fiberglass');
    seed(node, flight(300));
    renderWithProviders(<FlightWarnings sim={shown().result} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]!.textContent).toMatch(/^⚠Serious: Fin set: the flight goes past the fins' flutter speed/);
  });

  it('is a note when the margin is only too close', () => {
    const node = fin('Fiberglass');
    seed(node, flight(220));
    renderWithProviders(<FlightWarnings sim={shown().result} />);
    expect(screen.getByRole('listitem').textContent).toMatch(/comes within 1\.25× of the fins' flutter speed/);
    expect(screen.getByRole('listitem').textContent).not.toMatch(/Serious/);
  });

  it('says nothing for a clear margin, an outdated run, or a material with no figure', () => {
    seed(fin('Fiberglass'), flight(150));
    const { unmount } = renderWithProviders(<FlightWarnings sim={shown().result} />);
    expect(screen.queryByRole('listitem')).toBeNull();
    unmount();
    seed(fin('Fiberglass'), flight(300), true);
    const second = renderWithProviders(<FlightWarnings sim={shown().result} />);
    expect(screen.queryByRole('listitem')).toBeNull();
    second.unmount();
    seed(fin('Cardboard'), flight(300));
    renderWithProviders(<FlightWarnings sim={shown().result} />);
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it("counts in the simulations table's warning badge, and describes itself there", () => {
    seed(fin('Fiberglass'), flight(300));
    const s = useWorkspaceStore.getState();
    renderWithProviders(
      <SimulationsTable
        sims={s.sims}
        activeId={s.activeId}
        selectedIds={[]}
        runs={{}}
        tree={s.tree}
        configs={s.configs}
        simPrefs={s.simPrefs}
        onSetConfig={() => {}}
        onSelect={() => {}}
        onToggle={() => {}}
        onToggleAll={() => {}}
        onOpenResults={() => {}}
      />,
    );
    const count = screen.getByRole('button', { name: 'Flight warnings (1)' });
    expect(document.getElementById(count.getAttribute('aria-describedby')!)?.textContent).toMatch(
      /goes past the fins' flutter speed/,
    );
  });

  it('uses the stock chosen in the dialog', () => {
    const node = fin('Cardboard');
    seed(node, flight(300));
    renderWithProviders(<FlightWarnings sim={shown().result} />);
    expect(screen.queryByRole('listitem')).toBeNull();
    act(() => chooseFinStock('fins', { stock: 'g10', shearPa: stockModulus('g10') }));
    expect(screen.getByRole('listitem').textContent).toMatch(/goes past the fins' flutter speed/);
  });
});
