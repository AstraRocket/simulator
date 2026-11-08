import { nsKey } from '../../../src/services/storage/storageKeys';
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { ExportDialog } from '../../../src/components/canvas/FlightPathExport';
import { readSettings, renderWithProviders, seedSettings } from '../../testing/renderWithProviders';
import type { FlightResult } from '../../../src/engine/openRocketEngine';
import type { LaunchConditions } from '../../../src/services/design/orkTree';

const series = {
  time: [0, 1, 2],
  altitude: [0, 100, 0],
  velocity: [0, 50, 10],
  acceleration: [20, 5, -9.8],
  Px: [0, 50, 100],
  Py: [0, 100, 200],
};
const events = [{ type: 'APOGEE', time: 1 }];

const flight = (branches?: unknown[]) =>
  ({
    summary: { maxAltitude: 100, maxVelocity: 50, maxAcceleration: 20 },
    series,
    events,
    ...(branches ? { branches } : {}),
  }) as unknown as FlightResult;

const launch = { latitudeDeg: 40, longitudeDeg: -105, launchAltitudeM: 1600 } as LaunchConditions;

const show = (result: FlightResult) =>
  renderWithProviders(
    <ExportDialog
      onClose={() => {}}
      meta={{ simName: 'Sim', rocketName: 'R', motorName: 'C6' }}
      launch={launch}
      result={result}
    />,
  );

const trackRef = () => screen.getByLabelText('Track altitude from') as HTMLSelectElement;
const pinRef = () => screen.getByLabelText('Waypoint altitude from') as HTMLSelectElement;
const shadow = () => screen.getByRole('checkbox', { name: 'Draw shadow down to the ground' }) as HTMLInputElement;
const balloons = () => screen.getByRole('checkbox', { name: 'Summary balloons' }) as HTMLInputElement;
const preset = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const pressed = () =>
  ['Drift cast', 'Flight path', 'Landing plots'].find((n) => preset(n).getAttribute('aria-pressed') === 'true') ?? null;

describe('flight-path export dialog', () => {
  // The dialog persists its options; cases must not inherit each other's.
  beforeEach(() => localStorage.clear());

  it('opens on the flight-path placement, selected', () => {
    show(flight());
    expect(pressed()).toBe('Flight path');
  });

  it('leaves the shadow off for every placement', () => {
    show(flight());
    for (const name of ['Drift cast', 'Flight path', 'Landing plots']) {
      fireEvent.click(preset(name));
      expect(shadow().checked).toBe(false);
    }
  });

  it('clears the placement highlight the moment a control it covers is moved', () => {
    show(flight());
    fireEvent.click(preset('Drift cast'));
    expect(pressed()).toBe('Drift cast');

    fireEvent.change(trackRef(), { target: { value: 'sealevel' } });
    expect(pressed()).toBeNull();

    fireEvent.change(trackRef(), { target: { value: 'clamped' } });
    expect(pressed()).toBe('Drift cast');
  });

  it('writes the summary balloons out of the box, and no placement changes that', () => {
    show(flight());
    expect(balloons().checked).toBe(true);
    for (const name of ['Drift cast', 'Flight path', 'Landing plots']) {
      fireEvent.click(preset(name));
      expect(balloons().checked).toBe(true);
    }
    fireEvent.click(preset('Drift cast'));
    fireEvent.click(balloons());
    expect(balloons().checked).toBe(false);
    expect(pressed()).toBe('Drift cast');
  });

  it('starts on the desktop defaults', () => {
    show(flight());
    expect(trackRef().value).toBe('automatic');
    expect(pinRef().value).toBe('automatic');
    expect(shadow().checked).toBe(false);
    expect(screen.getByRole('checkbox', { name: 'Draw waypoint names on the map' })).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: 'Color waypoint pins per stage' }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it('sets the track and the pins independently', () => {
    show(flight());
    const options = ['automatic', 'ground', 'sealevel', 'clamped'];
    expect([...trackRef().options].map((o) => o.value)).toEqual(options);
    expect([...pinRef().options].map((o) => o.value)).toEqual(options);

    fireEvent.change(trackRef(), { target: { value: 'sealevel' } });
    fireEvent.change(pinRef(), { target: { value: 'clamped' } });
    expect([trackRef().value, pinRef().value]).toEqual(['sealevel', 'clamped']);
  });

  it('disables the shadow only once BOTH halves are on the ground', () => {
    show(flight());
    fireEvent.change(trackRef(), { target: { value: 'clamped' } });
    expect(shadow().disabled).toBe(false);

    fireEvent.change(pinRef(), { target: { value: 'clamped' } });
    expect(shadow().disabled).toBe(true);
  });

  it('presets reach all three sections, and only through the visible controls', () => {
    show(flight());
    const check = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

    fireEvent.click(screen.getByRole('button', { name: 'Drift cast' }));
    expect([trackRef().value, pinRef().value]).toEqual(['clamped', 'clamped']);
    expect(check('Include flight path line').checked).toBe(false);
    expect(check('Include ground track').checked).toBe(true);
    expect(check('Landing').checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Landing plots' }));
    expect(check('Landing').checked).toBe(true);
    expect(check('Apogee').checked).toBe(false);
    expect(check('Include ground track').checked).toBe(false);

    fireEvent.change(trackRef(), { target: { value: 'sealevel' } });
    fireEvent.click(check('Apogee'));
    expect(trackRef().value).toBe('sealevel');
    expect(check('Apogee').checked).toBe(true);
  });

  it('every preset is reachable from every other', () => {
    show(flight());
    const check = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

    fireEvent.click(screen.getByRole('button', { name: 'Landing plots' }));
    expect(check('Apogee').checked).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Drift cast' }));
    expect(check('Apogee').checked).toBe(true);
    expect(check('Include ground track').checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Flight path' }));
    expect(check('Apogee').checked).toBe(true);
    expect(check('Include flight path line').checked).toBe(true);
  });

  it('hides the stage-track control for a single-stage flight', () => {
    show(flight());
    expect(screen.queryByLabelText("Each stage's track starts")).toBeNull();
  });

  it('shows the stage-track control once the flight staged', () => {
    show(
      flight([
        { name: 'Sustainer', events, series },
        { name: 'Booster', events, series },
      ]),
    );
    const select = screen.getByLabelText("Each stage's track starts") as HTMLSelectElement;
    expect(select.value).toBe('separation');
    expect([...select.options].map((o) => o.value)).toEqual(['separation', 'pad']);
  });

  it('offers an export language, following the app until you pick one', () => {
    show(flight());
    const select = screen.getByLabelText('Language') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect([...select.options].map((o) => o.value)).toEqual([
      '',
      'en',
      'de',
      'es',
      'fr',
      'pt-BR',
      'pt-PT',
      'nl',
      'pl',
      'ru',
      'ja',
    ]);
    expect(select.options[0]!.textContent).toBe('Same as the app');
  });

  it('remembers the export language, including a deliberate "follow the app"', () => {
    // '' is a choice here, not an absence, so it must survive a reload.
    const stored = () => (readSettings().pathExport as Record<string, unknown>).exportLanguage;
    const { unmount } = show(flight());
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'es' } });
    expect(stored()).toBe('es');

    unmount();
    show(flight());
    expect((screen.getByLabelText('Language') as HTMLSelectElement).value).toBe('es');
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: '' } });
    expect(stored()).toBe('');
  });

  it('carries the mission name, and leaves the markers out of it by default', () => {
    show(flight());
    const mission = screen.getByLabelText('Mission') as HTMLInputElement;
    expect(mission.value).toBe('');
    fireEvent.change(mission, { target: { value: 'Sod Blaster' } });
    expect(mission.value).toBe('Sod Blaster');
    expect((screen.getByRole('checkbox', { name: 'Prefix the waypoint names too' }) as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it('carries the options, including every stage color, into the next export', () => {
    const { unmount } = show(
      flight([
        { name: 'Sustainer', events, series },
        { name: 'Booster', events, series },
      ]),
    );
    const openColors = () => fireEvent.click(screen.getByRole('button', { name: 'Stage colors\u2026' }));
    const colors = () => within(screen.getByRole('dialog', { name: 'Stage colors' }));
    const swatch = (stage: string, role: string) => colors().getByLabelText(`${stage} ${role}`) as HTMLInputElement;

    openColors();
    fireEvent.change(swatch('Sustainer', 'Path'), { target: { value: '#112233' } });
    fireEvent.change(swatch('Sustainer', 'Ground'), { target: { value: '#445566' } });
    fireEvent.change(swatch('Booster', 'Pin'), { target: { value: '#778899' } });
    fireEvent.click(colors().getByRole('button', { name: 'OK' }));

    unmount();
    show(
      flight([
        { name: 'Sustainer', events, series },
        { name: 'Booster', events, series },
      ]),
    );
    openColors();
    expect(swatch('Sustainer', 'Path').value).toBe('#112233');
    expect(swatch('Sustainer', 'Ground').value).toBe('#445566');
    expect(swatch('Booster', 'Pin').value).toBe('#778899');
    expect(swatch('Booster', 'Path').value).toBe('#d95319');
    expect(swatch('Sustainer', 'Pin').value).toBe('#0072bd');
  });

  it('does not carry the mission name over', () => {
    const { unmount } = show(flight());
    const mission = () => screen.getByLabelText('Mission') as HTMLInputElement;
    fireEvent.change(mission(), { target: { value: 'Ship of Theseus' } });
    expect(mission().value).toBe('Ship of Theseus');

    unmount();
    show(flight());
    expect(mission().value).toBe('');
  });

  it('answers Escape only for the surface on top, and closes once', () => {
    let closes = 0;
    renderWithProviders(
      <ExportDialog
        onClose={() => (closes += 1)}
        meta={{ simName: 'Sim', rocketName: 'R', motorName: 'C6' }}
        launch={launch}
        result={flight([
          { name: 'Sustainer', events, series },
          { name: 'Booster', events, series },
        ])}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stage colors…' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Stage colors' })).toBeNull();
    expect(closes).toBe(0);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closes).toBe(1);
  });

  it('gives every stage a swatch per role, and only commits them on OK', () => {
    show(
      flight([
        { name: 'Sustainer', events, series },
        { name: 'Booster', events, series },
      ]),
    );
    const openColors = () => fireEvent.click(screen.getByRole('button', { name: 'Stage colors\u2026' }));
    // Scoped to the sub-dialog: the export dialog behind it has a Cancel too.
    const colors = () => within(screen.getByRole('dialog', { name: 'Stage colors' }));
    const swatch = (stage: string, role: string) => colors().getByLabelText(`${stage} ${role}`) as HTMLInputElement;

    openColors();
    expect(swatch('Sustainer', 'Path').value).toBe('#0072bd');
    expect(swatch('Sustainer', 'Ground').value).toBe('#ff2d55');
    expect(swatch('Sustainer', 'Pin').value).toBe('#0072bd');
    expect(swatch('Booster', 'Path').value).toBe('#d95319');
    expect(swatch('Booster', 'Ground').value).toBe('#00b3a4');

    fireEvent.change(swatch('Sustainer', 'Path'), { target: { value: '#112233' } });
    fireEvent.click(colors().getByRole('button', { name: 'Cancel' }));
    openColors();
    expect(swatch('Sustainer', 'Path').value).toBe('#0072bd');

    fireEvent.change(swatch('Sustainer', 'Path'), { target: { value: '#112233' } });
    expect(swatch('Sustainer', 'Ground').value).toBe('#ff2d55');
    expect(swatch('Sustainer', 'Pin').value).toBe('#0072bd');

    fireEvent.change(swatch('Sustainer', 'Ground'), { target: { value: '#445566' } });
    fireEvent.change(swatch('Sustainer', 'Pin'), { target: { value: '#778899' } });
    fireEvent.click(colors().getByRole('button', { name: 'OK' }));
    openColors();
    expect(swatch('Sustainer', 'Path').value).toBe('#112233');
    expect(swatch('Sustainer', 'Ground').value).toBe('#445566');
    expect(swatch('Sustainer', 'Pin').value).toBe('#778899');
    expect(swatch('Booster', 'Path').value).toBe('#d95319');

    fireEvent.click(colors().getByRole('button', { name: 'Reset to defaults' }));
    expect(swatch('Sustainer', 'Path').value).toBe('#0072bd');
    expect(swatch('Sustainer', 'Ground').value).toBe('#ff2d55');
    expect(swatch('Sustainer', 'Pin').value).toBe('#0072bd');
  });

  it('toggles the waypoint display options', () => {
    show(flight());
    const pins = screen.getByRole('checkbox', { name: 'Color waypoint pins per stage' }) as HTMLInputElement;
    fireEvent.click(pins);
    expect(pins.checked).toBe(false);
  });

  describe('persistence', () => {
    const altUnit = () => screen.getByLabelText('Altitude') as HTMLSelectElement;
    const distUnit = () => screen.getByLabelText('Distance') as HTMLSelectElement;
    const stored = () => localStorage.getItem(nsKey('settings:v1'));
    const setAppDistance = (unit: string) => {
      const s = readSettings();
      seedSettings({ ...s, units: { ...(s.units as Record<string, string>), distance: unit } });
    };

    it('does not persist anything just for being opened', () => {
      show(flight());
      expect(stored()).toBeNull();
    });

    it('does not write the settings while the mission name is typed', () => {
      show(flight());
      const mission = screen.getByLabelText('Mission') as HTMLInputElement;
      fireEvent.change(mission, { target: { value: 'S' } });
      fireEvent.change(mission, { target: { value: 'Sod' } });
      expect(mission.value).toBe('Sod');
      expect(stored()).toBeNull();
    });

    it('writes the settings when a persisted option changes', () => {
      show(flight());
      fireEvent.click(screen.getByRole('checkbox', { name: 'Apogee' }));
      const p = readSettings().pathExport as Record<string, unknown>;
      expect(p.waypoints).not.toContain('apogee');
      expect(p).not.toHaveProperty('missionName');
    });

    it('follows the app distance unit until a unit is chosen in the dialog', () => {
      const { unmount } = show(flight());
      expect([altUnit().value, distUnit().value]).toEqual(['m', 'm']);
      fireEvent.click(screen.getByRole('checkbox', { name: 'Apogee' }));
      unmount();
      const p = readSettings().pathExport as Record<string, unknown>;
      expect(p).not.toHaveProperty('altitudeUnit');
      expect(p).not.toHaveProperty('distanceUnit');

      setAppDistance('ft');
      show(flight());
      expect([altUnit().value, distUnit().value]).toEqual(['ft', 'ft']);
    });

    it('keeps a unit chosen in the dialog, and only that one', () => {
      const { unmount } = show(flight());
      fireEvent.change(altUnit(), { target: { value: 'km' } });
      unmount();

      setAppDistance('ft');
      show(flight());
      expect(altUnit().value).toBe('km');
      expect(distUnit().value).toBe('ft');
    });
  });
});
