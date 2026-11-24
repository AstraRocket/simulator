// @vitest-environment jsdom
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { CustomExpressionsDialog } from '../../../src/components/sim/CustomExpressionsDialog';
import { __setEngineForTests } from '../../../src/engine/openRocketEngine';
import { useEngineStore } from '../../../src/state/engineStore';
import { useWorkspaceStore } from '../../../src/state/store';
import { withCustomExpressions, type CustomExpression } from '../../../src/services/flight/customExpressions';
import { loadEngine } from '../../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

const KE: CustomExpression = { name: 'Kinetic energy', symbol: 'KE', unit: 'J', expression: '0.5*m*Vt^2' };
const TWICE: CustomExpression = { name: 'Twice', symbol: 'TW', unit: '', expression: 'KE*2' };

const initial = useEngineStore.getState();
beforeAll(async () => {
  __setEngineForTests(await loadEngine());
  act(() => useEngineStore.setState({ phase: 'ready' }));
});
afterAll(() => {
  __setEngineForTests(null);
  useEngineStore.setState(initial);
});

const stored = () => useWorkspaceStore.getState().tree.customExpressions;
const open = (list: CustomExpression[]) => {
  act(() => useWorkspaceStore.setState((s) => ({ tree: withCustomExpressions(s.tree, list) })));
  renderWithProviders(<CustomExpressionsDialog onClose={() => {}} />);
};
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () => screen.getByRole('button', { name: 'Save' });

describe('the custom expressions dialog', () => {
  beforeEach(() => act(() => useWorkspaceStore.setState((s) => ({ tree: withCustomExpressions(s.tree, []) }))));

  it('adds one, as one undo step', () => {
    open([]);
    fireEvent.click(screen.getByRole('button', { name: 'New expression' }));
    type('Name', 'Kinetic energy');
    type('Symbol', 'KE');
    type('Unit', 'J');
    type('Formula', '0.5*m*Vt^2');
    fireEvent.click(save());
    expect(stored()).toEqual([KE]);
    act(() => useWorkspaceStore.getState().undo());
    expect(stored()).toBeUndefined();
  });

  it('says what is wrong and does not save it', () => {
    open([KE]);
    fireEvent.click(screen.getByRole('button', { name: 'New expression' }));
    type('Name', 'Altitude');
    type('Symbol', 'KE');
    type('Formula', 'nope*2');
    expect(screen.getByText('Another flight variable has this name.')).toBeTruthy();
    expect(screen.getByText('Another flight variable has this symbol.')).toBeTruthy();
    expect(screen.getByText(/^This formula cannot be calculated/)).toBeTruthy();
    expect(save()).toHaveProperty('disabled', true);
  });

  it('does not let a symbol be taken from an expression below', () => {
    open([KE, TWICE]);
    fireEvent.click(screen.getByRole('button', { name: /Kinetic energy/ }));
    type('Symbol', 'TW');
    expect(screen.getByText('Another flight variable has this symbol.')).toBeTruthy();
  });

  it('moves one, and marks a formula that now comes before what it uses', () => {
    open([KE, TWICE]);
    expect(screen.queryByText('Cannot be calculated')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Twice/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Calculate earlier' }));
    expect(stored()).toEqual([TWICE, KE]);
    expect(within(screen.getByRole('button', { name: /Twice/ })).getByText('Cannot be calculated')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Calculate earlier' })).toHaveProperty('disabled', true);
  });

  it('inserts a variable and a function into the formula', () => {
    open([KE]);
    fireEvent.click(screen.getByRole('button', { name: 'New expression' }));
    fireEvent.change(screen.getByLabelText('Insert a function…'), { target: { value: 'abs(|)' } });
    const box = screen.getByLabelText<HTMLTextAreaElement>('Formula');
    expect(box.value).toBe('abs()');
    box.setSelectionRange(4, 4);
    fireEvent.change(screen.getByLabelText('Insert a variable…'), { target: { value: 'KE' } });
    expect(box.value).toBe('abs(KE)');
  });

  it('imports the expressions of another .ork', async () => {
    open([KE]);
    const xml = `<openrocket version="1.10"><rocket><name>X</name><subcomponents><stage><name>S</name><subcomponents>
      <bodytube><name>B</name><length>0.3</length><thickness>0.001</thickness><radius>0.02</radius></bodytube>
      </subcomponents></stage></subcomponents></rocket><datatypes>
      <type source="customexpression"><name>Kinetic energy</name><symbol>KE</symbol><unit unittype="auto">J</unit><expression>m</expression></type>
      <type source="customexpression"><name>Twice</name><symbol>TW</symbol><unit unittype="auto"/><expression>KE*2</expression></type>
      </datatypes></openrocket>`;
    const file = new File([xml], 'other.ork');
    Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(new TextEncoder().encode(xml).buffer) });
    fireEvent.change(screen.getByLabelText('Import custom expressions from another .ork file'), {
      target: { files: [file] },
    });
    await waitFor(() => expect(stored()).toEqual([KE, TWICE]));
    expect(screen.getByText('Imported: 1. Left out, name or symbol already used: 1.')).toBeTruthy();
  });
});
