// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';

import { RunButton } from '../../../src/components/sim/RunButton';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { useWorkspaceStore } from '../../../src/state/store';
import { seatMotor, CURVELESS } from '../../testing/seatMotor';
import { MAX_WIND_SPEED_MS } from '../../../src/services/flight/safetyLimits';

const st = () => useWorkspaceStore.getState();
const byName = (n: string) => st().sims.find((x) => x.name === n)!;
const button = () => screen.getByRole('button') as HTMLButtonElement;

// Row 0 survives `beforeEach`, so its launch block is reset explicitly.
const LAUNCH = {
  launchRodLengthM: 1,
  launchRodAngleDeg: 0,
  windAverage: 0,
  windStdDev: 0,
  launchAltitudeM: 0,
  latitudeDeg: 28.61,
  longitudeDeg: -80.6,
  temperatureC: null,
  pressureHPa: null,
};

describe('RunButton over a selection', () => {
  beforeEach(() => {
    st().setSimsSelected([]);
    while (st().sims.length > 1) st().deleteSim(st().sims[st().sims.length - 1]!.id);
    st().renameSim(st().sims[0]!.id, 'Good');
    st().addSim();
    st().renameSim(st().sims[1]!.id, 'NoMotor');
    st().addSim();
    st().renameSim(st().sims[2]!.id, 'TooWindy');
    st().commitEdit();

    useWorkspaceStore.setState({
      info: { length: 0.3, mass: 0.07 } as never,
      sims: st()
        .sims.map((x) => ({ ...x, launch: { ...LAUNCH } }))
        .map((x) =>
          x.name === 'TooWindy' ? { ...x, launch: { ...x.launch, windAverage: MAX_WIND_SPEED_MS + 5 } } : x,
        ),
    });
    seatMotor('NoMotor', CURVELESS);
  });

  it('counts only the rows that will actually fly', () => {
    st().setSimsSelected([byName('Good').id, byName('NoMotor').id, byName('TooWindy').id]);
    renderWithProviders(<RunButton />);
    expect(button().disabled).toBe(false);
    expect(button().textContent).toMatch(/Run flight simulation/i);
  });

  it('stays enabled when some rows can fly, and names the ones it will skip', () => {
    st().setSimsSelected([byName('Good').id, byName('TooWindy').id]);
    renderWithProviders(<RunButton />);
    expect(button().disabled).toBe(false);
    expect(screen.getByText(/TooWindy/)).toBeTruthy();
    expect(screen.getByText(/Skipping/i)).toBeTruthy();
  });

  it('hides the warning glyph from a screen reader', () => {
    st().setSimsSelected([byName('Good').id, byName('TooWindy').id]);
    renderWithProviders(<RunButton />);
    const glyph = screen.getByText('⚠');
    expect(glyph.getAttribute('aria-hidden')).toBe('true');
  });

  it('names an unflyable row in a batch', () => {
    st().setSimsSelected([byName('Good').id, byName('NoMotor').id]);
    renderWithProviders(<RunButton />);
    expect(screen.getByText(/NoMotor/)).toBeTruthy();
  });

  it('goes dead only when nothing in the selection can fly', () => {
    st().setSimsSelected([byName('NoMotor').id, byName('TooWindy').id]);
    renderWithProviders(<RunButton />);
    expect(button().disabled).toBe(true);
    expect(screen.getByText(/NoMotor/)).toBeTruthy();
    expect(screen.getByText(/TooWindy/)).toBeTruthy();
  });

  it('refuses a row with a blank required field, naming the field', () => {
    useWorkspaceStore.setState({
      sims: st().sims.map((x) => (x.name === 'Good' ? { ...x, launch: { ...x.launch, launchRodLengthM: null } } : x)),
    });
    st().setSimsSelected([byName('Good').id]);
    renderWithProviders(<RunButton />);
    expect(button().disabled).toBe(true);
    expect(screen.getByText(/rod length/i)).toBeTruthy();
  });

  it('says nothing at all when every selected row is flyable', () => {
    st().setSimsSelected([byName('Good').id]);
    renderWithProviders(<RunButton />);
    expect(button().disabled).toBe(false);
    expect(screen.queryByText(/Skipping/i)).toBeNull();
  });
});
