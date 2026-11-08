import { describe, it, expect } from 'vitest';
import { deviceDescent, sustainerDescentMass } from '../../../src/services/flight/recoveryFlown';
import type { FlightResult } from '../../../src/engine/openRocketEngine';

const branch = (name: string, mass: number) => ({
  name,
  events: [
    { type: 'LAUNCH', time: 0 },
    { type: 'APOGEE', time: 5 },
    { type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 5, source: 'Drogue' },
    { type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 15, source: 'Main' },
    { type: 'GROUND_HIT', time: 25 },
  ],
  series: {
    time: [0, 5, 10, 15, 20, 25],
    mass: [mass + 0.02, mass, mass, mass, mass, mass],
    velocity: [0, -2, -20, -19, -6, -5.5],
  },
});

const single = (): FlightResult =>
  ({
    summary: {},
    ...branch('', 0.4),
  }) as unknown as FlightResult;

const staged = (): FlightResult =>
  ({
    summary: {},
    ...branch('Sustainer', 0.4),
    branches: [branch('Sustainer', 0.4), { ...branch('Booster', 0.15), events: boosterEvents() }],
  }) as unknown as FlightResult;

const dev = (name: string) => ({ id: `id-${name}`, name, nameShared: false });

const boosterEvents = () => [
  { type: 'STAGE_SEPARATION', time: 3 },
  { type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 5, source: 'Booster chute' },
  { type: 'GROUND_HIT', time: 25 },
];

describe('deviceDescent', () => {
  it('reads the mass the kernel had under that device, not the loaded mass', () => {
    const d = deviceDescent(single(), dev('Drogue'));
    expect(d?.mass).toBeCloseTo(0.4, 12);
  });

  it('reads the settled rate at the end of the phase, not at the opening', () => {
    expect(deviceDescent(single(), dev('Drogue'))?.rate).toBeCloseTo(19, 12);
    expect(deviceDescent(single(), dev('Main'))?.rate).toBeCloseTo(5.5, 12);
  });

  it('reports a speed, not the negative the series carries on the way down', () => {
    expect(deviceDescent(single(), dev('Main'))?.rate).toBeGreaterThan(0);
  });

  it('carries the kernel event time', () => {
    expect(deviceDescent(single(), dev('Drogue'))?.time).toBe(5);
  });

  it('has no branch name to give for a single-branch flight', () => {
    expect(deviceDescent(single(), dev('Drogue'))?.branch).toBe('');
  });

  it('reads a booster from its own branch', () => {
    const b = deviceDescent(staged(), dev('Booster chute'));
    expect(b?.branch).toBe('Booster');
    expect(b?.mass).toBeCloseTo(0.15, 12);
    const s = deviceDescent(staged(), dev('Drogue'));
    expect(s?.branch).toBe('Sustainer');
    expect(s?.mass).toBeCloseTo(0.4, 12);
  });

  it('answers nothing for a device the run never deployed', () => {
    expect(deviceDescent(single(), dev('Not fitted'))).toBeNull();
  });

  it('answers nothing without a run, or without a name to match', () => {
    expect(deviceDescent(null, dev('Drogue'))).toBeNull();
    expect(deviceDescent(single(), dev(''))).toBeNull();
  });

  it('matches a device by node id when the events carry ids', () => {
    const r = single() as unknown as { events: { type: string; time: number; source?: string; sourceId?: string }[] };
    r.events = [
      { type: 'APOGEE', time: 5 },
      { type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 5, source: '[Parachute.Parachute]', sourceId: 'drogue' },
      { type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 15, source: '[Parachute.Parachute]', sourceId: 'main' },
      { type: 'GROUND_HIT', time: 25 },
    ];
    const main = { id: 'main', name: '[Parachute.Parachute]', nameShared: true };
    expect(deviceDescent(r as unknown as FlightResult, main)?.time).toBe(15);
    expect(deviceDescent(r as unknown as FlightResult, main)?.rate).toBeCloseTo(5.5, 12);
    expect(deviceDescent(r as unknown as FlightResult, { ...main, id: 'other' })).toBeNull();
  });

  it('answers nothing for a shared name in a result without ids', () => {
    expect(deviceDescent(single(), { ...dev('Main'), nameShared: true })).toBeNull();
  });

  it('answers nothing when the run carries no mass series', () => {
    const r = single() as unknown as { series: Record<string, unknown> };
    delete r.series.mass;
    expect(deviceDescent(r as unknown as FlightResult, dev('Drogue'))).toBeNull();
  });

  it('reads the settled rate for devices that open together', () => {
    const r = single() as unknown as { events: { type: string; time: number; source?: string }[] };
    r.events = [
      { type: 'APOGEE', time: 5 },
      { type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 5, source: 'Drogue' },
      { type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 5, source: 'Main' },
      { type: 'GROUND_HIT', time: 25 },
    ];
    expect(deviceDescent(r as unknown as FlightResult, dev('Drogue'))?.rate).toBeCloseTo(5.5, 12);
    expect(deviceDescent(r as unknown as FlightResult, dev('Main'))?.rate).toBeCloseTo(5.5, 12);
  });

  // A main 0.1 s behind the drogue opens with it; the drogue's rate then is free fall.
  it('takes devices that open within a fifth of a second as one step', () => {
    const r = single() as unknown as { events: { type: string; time: number; source?: string }[] };
    r.events = [
      { type: 'APOGEE', time: 5 },
      { type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 5.001, source: 'Drogue' },
      { type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 5.1, source: 'Main' },
      { type: 'GROUND_HIT', time: 25 },
    ];
    expect(deviceDescent(r as unknown as FlightResult, dev('Drogue'))?.rate).toBeCloseTo(5.5, 12);
    expect(deviceDescent(r as unknown as FlightResult, dev('Main'))?.rate).toBeCloseTo(5.5, 12);
  });

  it('reads nothing for a device that opened after landing', () => {
    const r = single() as unknown as { events: { type: string; time: number; source?: string }[] };
    r.events = [
      { type: 'APOGEE', time: 5 },
      { type: 'GROUND_HIT', time: 20 },
      { type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 22, source: 'Main' },
    ];
    expect(deviceDescent(r as unknown as FlightResult, dev('Main'))).toBeNull();
    expect(sustainerDescentMass(r as unknown as FlightResult)).toBeNull();
  });

  it('reads the vertical speed when the run recorded it', () => {
    const r = single() as unknown as { series: Record<string, number[]> };
    r.series = { ...r.series, Vz: [0, -2, -18, -17, -5.2, -5] };
    expect(deviceDescent(r as unknown as FlightResult, dev('Main'))?.rate).toBeCloseTo(5, 12);
  });

  it('uses the last sample when nothing ends the phase', () => {
    const r = single() as unknown as { events: { type: string; time: number; source?: string }[] };
    r.events = [{ type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 5, source: 'Main' }];
    expect(deviceDescent(r as unknown as FlightResult, dev('Main'))?.rate).toBeCloseTo(5.5, 12);
  });
});

describe('sustainerDescentMass', () => {
  it('reads the first deployment on the first branch', () => {
    expect(sustainerDescentMass(single())).toBeCloseTo(0.4, 12);
    expect(sustainerDescentMass(staged())).toBeCloseTo(0.4, 12);
  });

  it('answers nothing for a flight with no recovery device', () => {
    const r = single() as unknown as { events: { type: string; time: number }[] };
    r.events = [{ type: 'GROUND_HIT', time: 25 }];
    expect(sustainerDescentMass(r as unknown as FlightResult)).toBeNull();
  });

  it('answers nothing without a run', () => {
    expect(sustainerDescentMass(null)).toBeNull();
  });
});
