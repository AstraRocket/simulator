// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { LaunchPanel } from '../../../src/components/sim/LaunchPanel';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { launchPatchFor, type LaunchConditions } from '../../../src/services/design/orkTree';
import { __setEngineForTests } from '../../../src/engine/openRocketEngine';
import { useEngineStore } from '../../../src/state/engineStore';

const LAUNCH: LaunchConditions = {
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

function refuseGeolocation() {
  const getCurrentPosition = vi.fn((_ok: PositionCallback, err?: PositionErrorCallback) => {
    err?.({ code: 1, message: 'denied' } as GeolocationPositionError);
  });
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
  return getCurrentPosition;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
});

// Screen readers ignore a live region mounted together with its text.
describe('the geolocation status region', () => {
  const geoRegion = () => screen.getByRole('button', { name: 'Show on map' }).nextElementSibling as HTMLElement;

  it('is mounted and empty before anything has been said', () => {
    refuseGeolocation();
    renderWithProviders(<LaunchPanel launch={LAUNCH} onChange={() => {}} />);
    const region = geoRegion();
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');
  });

  it('is the same element once the refusal arrives, carrying the message', () => {
    refuseGeolocation();
    renderWithProviders(<LaunchPanel launch={LAUNCH} onChange={() => {}} />);
    const before = geoRegion();

    fireEvent.click(screen.getByRole('button', { name: /use my location/i }));

    const after = geoRegion();
    expect(after).toBe(before);
    expect(after.textContent).toContain('Could not get your location');
  });
});

// The browser's altitude is above the ellipsoid, not sea level, so a located site's is left blank.
describe('a site found by "Use my location"', () => {
  it('clears the previous elevation', () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) => {
      ok({ coords: { latitude: 39.5, longitude: -105.1, altitude: 1650 } } as GeolocationPosition);
    });
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    const onChange = vi.fn();
    renderWithProviders(<LaunchPanel launch={LAUNCH} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /use my location/i }));
    expect(onChange).toHaveBeenCalledWith({ latitudeDeg: 39.5, longitudeDeg: -105.1, launchAltitudeM: null });
  });
});

it('drops a location that arrives after the panel was closed', () => {
  let allow!: PositionCallback;
  const getCurrentPosition = vi.fn((ok: PositionCallback) => {
    allow = ok;
  });
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
  const onChange = vi.fn();
  const { unmount } = renderWithProviders(<LaunchPanel launch={LAUNCH} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: /use my location/i }));
  unmount();
  allow({ coords: { latitude: 39.5, longitude: -105.1, altitude: 1650 } } as GeolocationPosition);
  expect(onChange).not.toHaveBeenCalled();
});

// Same-named radios in two panels are one group.
it('gives each panel its own wind model group', () => {
  renderWithProviders(
    <>
      <LaunchPanel launch={LAUNCH} onChange={() => {}} />
      <LaunchPanel launch={LAUNCH} onChange={() => {}} />
    </>,
  );
  const names = new Set(
    [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
      .filter((r) => r.closest('fieldset')?.querySelector('legend')?.textContent === 'Wind model to use')
      .map((r) => r.name),
  );
  expect(names.size).toBe(2);
});

describe('launch site bounds', () => {
  it('bounds altitude to -500..10000 m', () => {
    renderWithProviders(<LaunchPanel launch={LAUNCH} onChange={() => {}} />);
    const input = screen.getByLabelText('Altitude') as HTMLInputElement;
    expect(input.min).toBe('-500');
    expect(input.max).toBe('10000');
  });

  it('bounds pressure to 300..1100 hPa', () => {
    renderWithProviders(<LaunchPanel launch={LAUNCH} onChange={() => {}} />);
    const input = screen.getByLabelText('Pressure') as HTMLInputElement;
    expect(input.min).toBe('300');
    expect(input.max).toBe('1100');
  });

  it('bounds temperature to -90..70 °C, and keeps an ordinary one as typed', () => {
    const onChange = vi.fn();
    renderWithProviders(<LaunchPanel launch={LAUNCH} onChange={onChange} />);
    const input = screen.getByLabelText('Temperature') as HTMLInputElement;
    // Given as -90 and 70 in a kelvin slot, every entry would clamp to -203 degrees C.
    expect(Number(input.min)).toBeCloseTo(-90, 9);
    expect(Number(input.max)).toBeCloseTo(70, 9);
    fireEvent.change(input, { target: { value: '30' } });
    expect(onChange).toHaveBeenLastCalledWith({ temperatureC: 30 });
  });

  it('clamps a typed altitude to the range', () => {
    const onChange = vi.fn();
    renderWithProviders(<LaunchPanel launch={LAUNCH} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Altitude'), { target: { value: '99999' } });
    expect(onChange).toHaveBeenLastCalledWith({ launchAltitudeM: 10000 });
  });
});

describe('the launcher angle limit', () => {
  const angle = () => screen.getByLabelText('Angle', { exact: true }) as HTMLInputElement;

  it('stops a model rocket at 30 degrees, and lets 25 through', () => {
    const onChange = vi.fn();
    renderWithProviders(<LaunchPanel launch={LAUNCH} onChange={onChange} powerClass="model" />);
    expect(Number(angle().max)).toBeCloseTo(30, 9);
    expect(screen.getByText(/NAR Model Rocket Safety Code, which asks for a launcher within 30°/)).toBeTruthy();
    fireEvent.change(angle(), { target: { value: '25' } });
    expect(onChange).toHaveBeenLastCalledWith({ launchRodAngleDeg: 25 });
  });

  it('stops a high power rocket at 20 degrees, so 25 lands on the limit', () => {
    const onChange = vi.fn();
    renderWithProviders(<LaunchPanel launch={LAUNCH} onChange={onChange} powerClass="highPower" />);
    expect(Number(angle().max)).toBeCloseTo(20, 9);
    expect(screen.getByText(/high power safety codes, which ask for a launcher within 20°/)).toBeTruthy();
    fireEvent.change(angle(), { target: { value: '25' } });
    expect(onChange).toHaveBeenLastCalledWith({ launchRodAngleDeg: 20 });
  });

  it('states both limits where no one class applies', () => {
    renderWithProviders(<LaunchPanel launch={LAUNCH} onChange={() => {}} />);
    expect(Number(angle().max)).toBeCloseTo(30, 9);
    expect(
      screen.getByText(/within 30° of vertical, and the NAR and Tripoli high power codes within 20°/),
    ).toBeTruthy();
  });

  // Desktop flies a negative into-wind angle signed (SimulationStatus.java, AbstractRKSimulationStepper.java).
  it('accepts a negative angle while launching into the wind, and floors at 0 otherwise', () => {
    const onChange = vi.fn();
    const intoWind = renderWithProviders(
      <LaunchPanel launch={{ ...LAUNCH, launchIntoWind: true }} onChange={onChange} powerClass="model" />,
    );
    expect(Number(angle().min)).toBeCloseTo(-30, 9);
    fireEvent.change(angle(), { target: { value: '-5' } });
    expect(onChange).toHaveBeenLastCalledWith({ launchRodAngleDeg: -5 });
    intoWind.unmount();

    renderWithProviders(<LaunchPanel launch={LAUNCH} onChange={onChange} powerClass="model" />);
    expect(Number(angle().min)).toBe(0);
    fireEvent.change(angle(), { target: { value: '-5' } });
    expect(onChange).toHaveBeenLastCalledWith({ launchRodAngleDeg: 0 });
  });
});

// Unset displays as 90 (east); 0 is a real heading (north).
describe('direction fields', () => {
  it('clear to unset rather than to 0', () => {
    const onChange = vi.fn();
    renderWithProviders(<LaunchPanel launch={{ ...LAUNCH, windDirectionDeg: 45 }} onChange={onChange} />);
    fireEvent.change(screen.getAllByRole('spinbutton', { name: 'Direction' }).at(-1)!, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ windDirectionDeg: undefined });
    expect(onChange).not.toHaveBeenCalledWith({ windDirectionDeg: 0 });
  });
});

describe('wind speed edits keep the turbulence', () => {
  function Host({ onLaunch }: { onLaunch: (l: LaunchConditions) => void }) {
    const [launch, setLaunch] = useState<LaunchConditions>({ ...LAUNCH, windAverage: 5, windStdDev: 0.75 });
    return (
      <LaunchPanel
        launch={launch}
        onChange={(p) =>
          setLaunch((l) => {
            const next = { ...l, ...launchPatchFor(p, l, 'row') };
            onLaunch(next);
            return next;
          })
        }
      />
    );
  }

  it('keeps 15% when "0.5" is typed over a 5 m/s, 15% wind', () => {
    let last = LAUNCH;
    renderWithProviders(<Host onLaunch={(l) => (last = l)} />);
    const speed = screen.getByRole('spinbutton', { name: 'Speed' });
    fireEvent.focus(speed);
    for (const text of ['', '0', '0.', '0.5']) fireEvent.change(speed, { target: { value: text } });
    fireEvent.blur(speed);

    expect(last.windAverage).toBe(0.5);
    expect(last.windStdDev).toBeCloseTo(0.075, 9);
    expect((screen.getByRole('spinbutton', { name: /turbulence intensity/i }) as HTMLInputElement).value).toBe('15');
  });
});

describe('weather and the forecast atmosphere', () => {
  it('offers the Weather dialog only where asked (the simulation editor, not the Settings defaults)', () => {
    const { unmount } = renderWithProviders(<LaunchPanel launch={LAUNCH} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Get weather…' })).toBeNull();
    unmount();
    renderWithProviders(<LaunchPanel launch={LAUNCH} onChange={() => {}} weather />);
    fireEvent.click(screen.getByRole('button', { name: 'Get weather…' }));
    expect(screen.getByRole('dialog', { name: 'Weather from Open-Meteo' })).toBeTruthy();
  });

  it('shows a forecast atmosphere that will fly, and clears it', () => {
    const onChange = vi.fn();
    const launch = {
      ...LAUNCH,
      atmosphereLevels: [
        { altitudeM: 1949, temperatureC: 2, pressureHPa: 800, relativeHumidity: 0.3 },
        { altitudeM: 3012, temperatureC: -5, pressureHPa: 700, relativeHumidity: 0.3 },
      ],
    };
    renderWithProviders(<LaunchPanel launch={launch} onChange={onChange} />);
    expect(screen.getByText(/^Forecast atmosphere to 3,?012 m$/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenCalledWith({ atmosphereLevels: undefined });
  });

  it('shows nothing for the standard atmosphere', () => {
    renderWithProviders(<LaunchPanel launch={LAUNCH} onChange={() => {}} />);
    expect(screen.queryByText(/Forecast atmosphere/)).toBeNull();
  });
});

describe('the weather source line', () => {
  const stamp = {
    provider: 'open-meteo' as const,
    endpoint: 'forecast' as const,
    date: '2026-10-05',
    hour: 12,
    timezone: 'America/Denver',
    latitudeDeg: 28.61,
    longitudeDeg: -80.6,
    elevationM: 0,
    validAt: '2026-10-05T18:00:00.000Z',
    fetchedAt: '2026-10-04T15:00:00.000Z',
    groups: ['temperature' as const],
    elevationApplied: false,
    applied: { temperatureC: 12 },
  };

  it('says where the weather came from, and offers Refresh in the simulation editor', () => {
    renderWithProviders(
      <LaunchPanel launch={{ ...LAUNCH, temperatureC: 12, weatherSource: stamp }} onChange={() => {}} weather />,
    );
    expect(screen.getByText(/^Open-Meteo forecast for .*, fetched /)).toBeTruthy();
    expect(screen.queryByText('Edited since it was applied.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh…' }));
    expect(screen.getByRole('dialog', { name: 'Weather from Open-Meteo' })).toBeTruthy();
  });

  it('says when a filled value was edited, or the site moved', () => {
    renderWithProviders(
      <LaunchPanel
        launch={{ ...LAUNCH, temperatureC: 20, latitudeDeg: 30, weatherSource: stamp }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Edited since it was applied.')).toBeTruthy();
    expect(screen.getByText('The launch site has moved since it was fetched.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Refresh…' })).toBeNull();
  });
});

describe('the Open-Meteo API key', () => {
  it('sits at the bottom of the Atmosphere card in the Settings copy only', () => {
    const { unmount } = renderWithProviders(<LaunchPanel launch={LAUNCH} onChange={() => {}} weatherKey />);
    const field = screen.getByLabelText('Open-Meteo API key');
    const card = screen.getByRole('heading', { name: 'Atmosphere' }).parentElement!;
    expect(card.contains(field)).toBe(true);
    unmount();
    renderWithProviders(<LaunchPanel launch={LAUNCH} onChange={() => {}} weather />);
    expect(screen.queryByLabelText('Open-Meteo API key')).toBeNull();
  });
});

describe('the sea-level pressure check', () => {
  afterEach(() => {
    __setEngineForTests(null);
    useEngineStore.setState({ phase: 'loading' });
  });

  const kernelAt1500 = () => {
    __setEngineForTests({ getStandardPressure: () => 84_556 });
    useEngineStore.setState({ phase: 'ready' });
  };

  it('cautions on a sea-level figure typed at a high site', () => {
    kernelAt1500();
    renderWithProviders(
      <LaunchPanel launch={{ ...LAUNCH, launchAltitudeM: 1500, pressureHPa: 1013 }} onChange={() => {}} />,
    );
    expect(screen.getByText(/reduced to sea level/)).toBeTruthy();
  });

  it('says nothing for a pressure that fits the site', () => {
    kernelAt1500();
    renderWithProviders(
      <LaunchPanel launch={{ ...LAUNCH, launchAltitudeM: 1500, pressureHPa: 850 }} onChange={() => {}} />,
    );
    expect(screen.queryByText(/reduced to sea level/)).toBeNull();
  });

  it('says nothing while the engine is still loading', () => {
    renderWithProviders(
      <LaunchPanel launch={{ ...LAUNCH, launchAltitudeM: 1500, pressureHPa: 1013 }} onChange={() => {}} />,
    );
    expect(screen.queryByText(/reduced to sea level/)).toBeNull();
  });
});

describe('the site buttons', () => {
  it('are named by their words, not their decorative glyphs', () => {
    refuseGeolocation();
    renderWithProviders(<LaunchPanel launch={LAUNCH} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Use my location' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show on map' })).toBeTruthy();
  });
});

// Desktop's switch changes only which model flies (SimulationOptions.java:183-188).
describe('switching wind models keeps the profile', () => {
  const profile = [
    { altitudeM: 0, speed: 3, directionDeg: 90, stddev: 0.3 },
    { altitudeM: 500, speed: 6, directionDeg: 120, stddev: 1.2 },
  ];

  function Host({ start, onLaunch }: { start: LaunchConditions; onLaunch: (l: LaunchConditions) => void }) {
    const [launch, setLaunch] = useState<LaunchConditions>(start);
    return (
      <LaunchPanel
        launch={launch}
        onChange={(p) =>
          setLaunch((l) => {
            const next = { ...l, ...launchPatchFor(p, l, 'row') };
            onLaunch(next);
            return next;
          })
        }
      />
    );
  }

  it('restores a kept profile on Multilevel, and keeps it again on Average', () => {
    let last: LaunchConditions = LAUNCH;
    renderWithProviders(<Host start={{ ...LAUNCH, keptWindLevels: profile }} onLaunch={(l) => (last = l)} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Multi-level' }));
    expect(last.windLevels).toEqual(profile);
    expect(last.keptWindLevels).toBeUndefined();

    fireEvent.click(screen.getByRole('radio', { name: 'Average' }));
    expect(last.windLevels).toBeUndefined();
    expect(last.keptWindLevels).toEqual(profile);
  });

  it('seeds one level from the single wind when there is nothing to restore', () => {
    let last: LaunchConditions = LAUNCH;
    renderWithProviders(
      <Host
        start={{ ...LAUNCH, windAverage: 4, windStdDev: 0.4, windDirectionDeg: 200 }}
        onLaunch={(l) => (last = l)}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Multi-level' }));
    expect(last.windLevels).toEqual([{ altitudeM: 0, speed: 4, directionDeg: 200, stddev: 0.4 }]);
  });
});
