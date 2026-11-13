// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders, seedSettings } from '../../testing/renderWithProviders';
import { useWorkspaceStore } from '../../../src/state/store';
import { FlightCard } from '../../../src/components/sim/FlightCard';
import type { ResultFlight } from '../../../src/services/flight/simulations';
import type { FlightConfig } from '../../../src/services/flight/flightConfigs';
import type { FlightResult, MotorSpec, RocketTree, StaticInfo } from '../../../src/engine/openRocketEngine';
import { METRIC_UNITS } from '../../../src/prefs/units';

const spec = {
  designation: 'H128',
  code: 'H128W',
  manufacturer: 'AeroTech',
  diameter: 0.029,
  length: 0.194,
  times: [0, 0.01, 1, 1.01],
  thrusts: [0, 300, 300, 0],
  masses: [0.2, 0.2, 0.1, 0.1],
  cgX: 0.1,
  ejectionDelay: 8,
} as MotorSpec;

const tree = {
  name: 'Rocket',
  components: [
    {
      id: 'st',
      type: 'stage',
      name: 'Sustainer',
      children: [
        {
          id: 'body',
          type: 'bodytube',
          name: 'Body',
          length: 0.6,
          outerRadius: 0.03,
          thickness: 0.001,
          motorMount: true,
          children: [
            {
              id: 'chute',
              type: 'parachute',
              name: 'Main chute',
              diameter: 0.9,
              deployEvent: 'altitude',
              deployAltitude: 150,
            },
          ],
        },
      ],
    },
  ],
} as unknown as RocketTree;

const launch = { launchRodLengthM: 1.8, launchRodAngleDeg: 5, windAverage: 3 };
const result = {
  summary: {
    maxAltitude: 410,
    maxVelocity: 95,
    maxMachNumber: 0.28,
    timeToApogee: 9.5,
    flightTime: 60,
    groundHitVelocity: 5,
    launchRodVelocity: 17,
    deploymentVelocity: 12,
    optimumDelay: 7.6,
  },
  events: [],
  series: {},
} as unknown as FlightResult;

function seed(): ResultFlight {
  useWorkspaceStore.setState({
    tree,
    configs: [{ id: 'c1', motors: { body: { spec } } } as unknown as FlightConfig],
    sims: [{ id: 's1', name: 'Sim 1', configId: 'c1', launch, result } as never],
    activeId: 's1',
    info: { length: 0.9, refDiameter: 0.06, mass: 1.2, cg: 0.5, cp: 0.62, stabilityCalibers: 2 } as StaticInfo,
  });
  return { id: 's1', name: 'Sim 1', result, launch } as unknown as ResultFlight;
}

describe('the flight card', () => {
  it('fills the card in from the flight: the certification, the motor in full, and when the chute opens', () => {
    const flight = seed();
    renderWithProviders(<FlightCard flight={flight} />);
    const card = screen.getAllByRole('article')[0]!;
    expect(card.textContent).toContain('Flight card');
    expect(card.textContent).toContain('Level 1 (H, 300 N·s in all)');
    expect(card.textContent).toContain('AeroTech H128W');
    expect(card.textContent).toContain('Altitude (descending) at 150 m');
    expect(screen.getByRole('button', { name: 'Print' })).toBeTruthy();
    expect(within(card).getByRole('region', { name: 'Before you fly' }).textContent).toContain('Not modeled at all');
    expect(card.textContent).not.toContain('not a flight card');
  });

  it('prints the card alone while the view is open, and gives the page back when it closes', () => {
    const flight = seed();
    const { unmount } = renderWithProviders(<FlightCard flight={flight} />);
    expect(document.documentElement.classList.contains('print-flight-card')).toBe(true);
    expect(document.body.querySelector(':scope > .flight-card-print article')).toBeTruthy();
    unmount();
    expect(document.documentElement.classList.contains('print-flight-card')).toBe(false);
    expect(document.body.querySelector('.flight-card-print')).toBeNull();
  });

  it('prints the flyer from Settings, and warns when the flight needs more than they hold', () => {
    seedSettings({
      flyer: {
        name: 'Pat Flyer',
        memberships: [
          { org: 'nar', number: '12345', level: 0 },
          { org: 'other', orgName: 'UKRA', number: 'U-7', level: 0 },
        ],
      },
    });
    const flight = seed();
    renderWithProviders(<FlightCard flight={flight} />);
    const card = screen.getAllByRole('article')[0]!;
    expect(card.textContent).toContain('Pat Flyer');
    expect(card.textContent).toMatch(/NAR\s*12345 · None/);
    expect(card.textContent).toMatch(/UKRA\s*U-7 · None/);
    expect(within(card).getByRole('note').textContent).toContain(
      'This flight needs Level 1; the highest you hold is None.',
    );
    expect(card.textContent).not.toContain('Certification held');
  });

  it('leaves lines to write on, and says where to save them, with no flyer saved', () => {
    localStorage.clear();
    const flight = seed();
    renderWithProviders(<FlightCard flight={flight} />);
    const card = screen.getAllByRole('article')[0]!;
    expect(card.textContent).toContain('Certification held');
    expect(card.textContent).toContain('Settings ▸ Flyer');
    expect(within(card).queryByRole('note')).toBeNull();
  });

  it('prints the rail and wind in the units the launch panel uses', () => {
    seedSettings({ units: { ...METRIC_UNITS, length: 'ft', distance: 'm', windspeed: 'mph', velocity: 'm/s' } });
    const flight = seed();
    renderWithProviders(<FlightCard flight={flight} />);
    const card = screen.getAllByRole('article')[0]!;
    // 1.8 m of rail and 3 m/s of wind.
    expect(card.textContent).toContain('5.91 ft');
    expect(card.textContent).toMatch(/6\.7\d? mph/);
    localStorage.clear();
  });

  it("leaves out a rocket's mass and CG the live build did not weigh", () => {
    const flight = seed();
    useWorkspaceStore.setState({
      configs: [
        { id: 'c1', motors: { body: { spec } } } as unknown as FlightConfig,
        { id: 'c2', motors: {} } as unknown as FlightConfig,
      ],
      sims: [
        { id: 's1', name: 'Sim 1', configId: 'c1', launch, result } as never,
        { id: 's2', name: 'Sim 2', configId: 'c2', launch, result: null } as never,
      ],
      activeId: 's2',
    });
    renderWithProviders(<FlightCard flight={flight} />);
    const card = screen.getAllByRole('article')[0]!;
    expect(card.textContent).toContain('so its mass, CG and stability are left out');
    expect(card.textContent).not.toContain('Mass (loaded)');
  });
});
