// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { useWorkspaceStore } from '../../../src/state/store';

const flySimple = vi.hoisted(() => vi.fn());
vi.mock('../../../src/components/tools/simpleFlight', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  flySimple,
}));
vi.mock('../../../src/services/motors/motorDb', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadCatalog: () => Promise.resolve([]),
}));
const MOTOR = vi.hoisted(() => ({ manufacturer: 'T', designation: 'H100', diameter: 0.029, length: 0.1 }));
vi.mock('../../../src/components/sim/MotorDialog', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  MotorDialog: ({ onSelect }: { onSelect: (m: unknown) => void }) => (
    <button onClick={() => onSelect(MOTOR)}>pick-motor</button>
  ),
}));

const { SimpleRocketTool } = await import('../../../src/components/tools/SimpleRocketTool');

const FIGURES = {
  railExit: 5,
  railTwr: 3.2,
  maxAcceleration: 80,
  burnoutTime: 1.2,
  apogee: 300,
  burnoutAltitude: 40,
  maxVelocity: 120,
  maxMach: 0.9,
  timeToApogee: 7,
  optimumDelay: 6,
  railStability: 0.5,
  landingVelocity: 12,
  deployVelocity: 50,
  flightTime: 40,
};

const enter = (name: string, value: string) => {
  const el = screen.getByRole('spinbutton', { name });
  fireEvent.focus(el);
  fireEvent.change(el, { target: { value } });
  fireEvent.blur(el);
};
const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name });
// Always mounted, so an empty region means no notice.
const notice = () => screen.queryByRole('status')?.textContent || undefined;

const enterRocket = () => {
  enter('Body diameter', '5');
  enter('Overall length', '100');
  enter('Dry mass', '100');
  enter('CG, no motor', '60');
  enter('Motor mount diameter', '29');
};
const pickMotor = () => {
  fireEvent.click(button('Choose…'));
  fireEvent.click(screen.getByText('pick-motor'));
};

beforeEach(() => {
  flySimple.mockReset().mockResolvedValue(FIGURES);
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(cleanup);

// The tool remembers its fields for the session, so the empty form has to come first.
describe('the benchtop tool', () => {
  it('cannot fly or open a design until the rocket and motor are entered', () => {
    renderWithProviders(<SimpleRocketTool />);
    expect(button('Run flight simulation').disabled).toBe(true);
    expect(button('Open as a design').disabled).toBe(true);
    expect(button('Choose…').disabled).toBe(true);
    expect(notice()).toBeUndefined();
  });

  it('says what is wrong with a rocket that cannot be built', () => {
    renderWithProviders(<SimpleRocketTool />);
    enterRocket();
    expect(notice()).toBeUndefined();
    expect(button('Choose…').disabled).toBe(false);

    enter('Overall length', '10');
    expect(notice()).toMatch(/longer than its 4:1 nose \(20\.0 cm\)/);
    enter('Overall length', '100');

    enter('CG, no motor', '200');
    expect(notice()).toMatch(/between the nose tip and 100 cm/);
    enter('CG, no motor', '60');

    enter('Motor mount diameter', '100');
    expect(notice()).toMatch(/mount \(100 mm\) must be narrower than the body \(5\.00 cm\)/);
    enter('Motor mount diameter', '29');

    enter('Fin length', '200');
    expect(notice()).toMatch(/fin length \(200 cm\) is longer than the body tube behind the nose \(80\.0 cm\)/);
    enter('Fin length', '');
    expect(notice()).toBeUndefined();
    expect(button('Choose…').disabled).toBe(false);
  });

  it('flies the rocket, warns on the figures and marks them stale after an edit', async () => {
    renderWithProviders(<SimpleRocketTool />);
    enterRocket();
    pickMotor();
    fireEvent.click(button('Run flight simulation'));

    await screen.findByText('Apogee');
    expect(flySimple).toHaveBeenCalledOnce();
    expect(screen.getByText('300 m')).toBeTruthy();
    expect(screen.getByText(/Below the minimum exit speed/)).toBeTruthy();
    expect(screen.getByText(/Under 1 caliber/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    expect(screen.queryByText(/The inputs have changed/)).toBeNull();
    enter('Dry mass', '200');
    expect(screen.getByText(/The inputs have changed/)).toBeTruthy();
    expect(screen.getByText('300 m')).toBeTruthy();
  });

  it('shows a failed flight as an alert', async () => {
    flySimple.mockRejectedValue(new Error('engine fell over'));
    renderWithProviders(<SimpleRocketTool />);
    enterRocket();
    pickMotor();
    fireEvent.click(button('Run flight simulation'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/engine fell over/);
  });

  it('opens the rocket as a design with its launch conditions', () => {
    const openNewDesign = vi.fn().mockResolvedValue(undefined);
    useWorkspaceStore.setState({ openNewDesign } as never);
    renderWithProviders(<SimpleRocketTool />);
    enterRocket();
    pickMotor();
    fireEvent.click(button('Open as a design'));
    expect(openNewDesign).toHaveBeenCalledOnce();
    expect(openNewDesign.mock.calls[0]![2]).toMatchObject({ launchRodLengthM: 1, launchAltitudeM: 0 });
  });
});
