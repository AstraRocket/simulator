// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { RecoveryBaysPane } from '../../../src/components/config/RecoveryBaysPane';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { useWorkspaceStore } from '../../../src/state/store';
import { bayRecord, updateBay } from '../../../src/services/flight/recoveryBays';
import { recoveryCharges } from '../../../src/services/flight/recoveryCharges';
import { __setBayStoreForTests, rememberBays, savedBays } from '../../../src/services/storage/bayStore';
import type { KeyValueStore } from '../../../src/services/storage/keyValueStore';
import type { RocketTree } from '../../../src/engine/openRocketEngine';

const at = (offset: number) => ({ method: 'top', offset });

const tree = (): RocketTree =>
  ({
    name: 'R',
    components: [
      {
        id: 'st',
        type: 'stage',
        children: [
          {
            id: 'upper',
            type: 'bodytube',
            name: 'Upper',
            length: 0.6,
            outerRadius: 0.04,
            thickness: 0.001,
            children: [{ id: 'main', type: 'parachute', name: 'Main', length: 0.05, position: at(0.1) }],
          },
        ],
      },
    ],
  }) as unknown as RocketTree;

const bay = () => screen.getByRole('region', { name: 'Main bay: Upper' });
const state = () => useWorkspaceStore.getState().tree;

describe('the Bays view', () => {
  beforeEach(() => useWorkspaceStore.setState({ tree: tree() }));

  it('shows each bay with the design’s size as the placeholder and the assumed pins', () => {
    renderWithProviders(<RecoveryBaysPane />);
    const card = within(bay());
    expect((card.getByLabelText('Bay length') as HTMLInputElement).placeholder).toBe('60.0');
    expect(bay().textContent).toMatch(/3 × #2-56 nylon pins are assumed/);
    expect(bay().textContent).toMatch(/No ground tests logged yet/);
  });

  it('sets the pins on the bay, and resets them to the design’s', () => {
    renderWithProviders(<RecoveryBaysPane />);
    fireEvent.change(within(bay()).getByLabelText('Pin size'), { target: { value: '4-40' } });
    expect(bayRecord(state(), 'upper', 'main').pins).toMatchObject({ count: 3, size: '4-40' });
    expect(bay().textContent).toMatch(/3 × #4-40 shear pins at .* each, set for this bay/);
    fireEvent.click(within(bay()).getByRole('button', { name: 'Use the design’s' }));
    expect(bayRecord(state(), 'upper', 'main').pins).toBeUndefined();
  });

  it('logs a ground test with the pins in, and flies its charge', () => {
    renderWithProviders(<RecoveryBaysPane />);
    const card = within(bay());
    fireEvent.change(card.getByLabelText('Date'), { target: { value: '2026-10-30' } });
    fireEvent.change(card.getByLabelText('Charge'), { target: { value: '1.2' } });
    fireEvent.change(card.getByLabelText('Result'), { target: { value: 'violent' } });
    fireEvent.change(card.getByLabelText('Notes'), { target: { value: 'Nose cone flew 10 m' } });
    fireEvent.click(card.getByRole('button', { name: 'Log test' }));
    const [logged] = bayRecord(state(), 'upper', 'main').tests;
    expect(logged).toMatchObject({ date: '2026-10-30', result: 'violent', notes: 'Nose cone flew 10 m' });
    expect(logged!.chargeKg).toBeCloseTo(0.0012, 9);
    expect(logged!.pins).toMatchObject({ count: 3, size: '2-56' });
    expect(bay().textContent).toMatch(/Separated, too violent/);

    fireEvent.click(card.getByRole('button', { name: 'Fly the charge tested on 2026-10-30' }));
    const record = bayRecord(state(), 'upper', 'main');
    expect(record.flownTestId).toBe(logged!.id);
    expect(record.primaryKg).toBeCloseTo(0.0012, 9);
    expect(record.backupKg).toBeCloseTo(0.0018, 9);
    expect(recoveryCharges(state()).map((c) => [c.role, c.backup])).toEqual([
      ['main', false],
      ['main', true],
    ]);
    expect(bay().textContent).toMatch(/Primary taken from the ground test on 2026-10-30/);
    expect(card.getByText('Flying')).toBeTruthy();
  });

  it('reads the pins from a mass object named for them, and a friction fit as none', () => {
    const withMass = (name: string): RocketTree => {
      const t = tree();
      const upper = (t.components[0]!.children ?? [])[0]!;
      upper.children = [...(upper.children ?? []), { id: 'p', type: 'masscomponent', name, position: at(0) } as never];
      return t;
    };
    useWorkspaceStore.setState({ tree: withMass('4x 4-40') });
    const { unmount } = renderWithProviders(<RecoveryBaysPane />);
    expect(bay().textContent).toMatch(/4 × #4-40 shear pins at .* each, from "4x 4-40"/);
    unmount();
    useWorkspaceStore.setState({ tree: withMass('Friction fit') });
    renderWithProviders(<RecoveryBaysPane />);
    expect(bay().textContent).toMatch(/No shear pins, from "Friction fit"/);
  });

  it('finds a device kept in an inner tube inside the body tube', () => {
    const t = tree();
    const upper = (t.components[0]!.children ?? [])[0]!;
    upper.children = [
      {
        id: 'holder',
        type: 'innertube',
        name: 'Chute holder',
        length: 0.2,
        outerRadius: 0.035,
        position: at(0.05),
        children: upper.children ?? [],
      } as never,
    ];
    useWorkspaceStore.setState({ tree: t });
    renderWithProviders(<RecoveryBaysPane />);
    expect(bay().textContent).toMatch(/Main/);
    expect((within(bay()).getByLabelText('Bay length') as HTMLInputElement).placeholder).toBe('60.0');
  });

  it('groups the bays by stage when there is more than one', () => {
    const t = tree();
    (t.components[0] as { name?: string }).name = 'Sustainer';
    t.components.push({
      id: 'boost',
      type: 'stage',
      name: 'Booster',
      children: [
        {
          id: 'lower',
          type: 'bodytube',
          name: 'Upper',
          length: 0.5,
          outerRadius: 0.04,
          thickness: 0.001,
          children: [{ id: 'bmain', type: 'parachute', name: 'Booster chute', length: 0.05, position: at(0.1) }],
        },
      ],
    } as never);
    t.components.push({ id: 'empty', type: 'stage', name: 'Empty', children: [] } as never);
    useWorkspaceStore.setState({ tree: t });
    renderWithProviders(<RecoveryBaysPane />);
    const sustainer = screen.getByRole('region', { name: 'Sustainer' });
    const booster = screen.getByRole('region', { name: 'Booster' });
    expect(within(sustainer).getByRole('region', { name: 'Main bay: Upper' }).textContent).toMatch(/Holds Main\./);
    expect(within(booster).getByRole('region', { name: 'Main bay: Upper' }).textContent).toMatch(/Holds Booster chute/);
    expect(screen.queryByRole('region', { name: 'Empty' })).toBeNull();
  });

  it('puts a single-stage design’s bays in a stage card too, an unnamed one labeled by its type', () => {
    renderWithProviders(<RecoveryBaysPane />);
    const stage = screen.getByRole('region', { name: 'Stage' });
    expect(within(stage).getByRole('region', { name: 'Main bay: Upper' })).toBeTruthy();
  });

  it('folds a stage’s bays away and opens them again', () => {
    renderWithProviders(<RecoveryBaysPane />);
    const toggle = screen.getByRole('button', { name: 'Stage' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Main bay: Upper' })).toBeNull();
    fireEvent.click(toggle);
    expect(bay()).toBeTruthy();
  });

  it('says so for a design with no bay to set up', () => {
    useWorkspaceStore.setState({
      tree: { name: 'R', components: [{ id: 'st', type: 'stage', children: [] }] } as never,
    });
    renderWithProviders(<RecoveryBaysPane />);
    expect(document.body.textContent).toMatch(/No recovery device sits in a body tube/);
  });
});

describe("the browser's copy of the records", () => {
  const memory = (): KeyValueStore => {
    const m = new Map<string, string>();
    return {
      get: (k) => Promise.resolve(m.get(k) ?? null),
      set: (k, v) => {
        m.set(k, v);
        return Promise.resolve(true);
      },
      remove: (k) => Promise.resolve(void m.delete(k)),
    } as KeyValueStore;
  };

  it('is kept per design name and read back', async () => {
    __setBayStoreForTests(memory());
    const kept = updateBay(tree(), 'upper', 'main', { pressurePa: 90000 });
    await rememberBays('R', kept);
    expect(await savedBays('R')).toEqual({ '0:Upper': { main: { pressurePa: 90000, tests: [] } } });
    expect(await savedBays('Other')).toBeNull();
  });

  it('keeps nothing for a design with no records', async () => {
    __setBayStoreForTests(memory());
    await rememberBays('R', tree());
    expect(await savedBays('R')).toBeNull();
  });
});
