import { describe, expect, it } from 'vitest';
import {
  burnExhausts,
  DEFAULT_EXHAUST,
  EXHAUST_IDS,
  EXHAUST_LOOKS,
  exhaustFor,
  exhaustIdFor,
} from '../../../src/services/motors/exhaust';
import type { CatalogMotor } from '../../../src/services/motors/motorDb';
import type { FlightConfig } from '../../../src/services/flight/flightConfigs';
import type { MotorSpec, RocketTree } from '../../../src/engine/openRocketEngine';

const look = (propInfo?: string, extra: Partial<CatalogMotor> = {}) => exhaustFor({ propInfo, ...extra });

describe("a propellant's exhaust", () => {
  it('reads the look off the name', () => {
    expect(look('Blackjack').smoke).toBeGreaterThan(0.8);
    expect(look('Blackjack').smokeColor).toBe(look('Black Max').smokeColor);
    expect(look('Blue Thunder').flame).toEqual(look('Blue Streak').flame);
    expect(look('Blue Thunder').smoke).toBeLessThan(look('White Lightning').smoke);
    expect(look('Mojave Green').flame).toEqual(look('Green3').flame);
    expect(look('Redline').flame).toEqual(look('Loki Red').flame);
    expect(look('Skidmark').sparks).toBe(true);
    expect(look('black powder').sparks).toBe(true);
  });

  it('takes the first name a mixed propellant gives', () => {
    expect(look('White Lightning/Warp 9')).toEqual(look('White Lightning'));
    expect(look('Super White Lightning')).toEqual(look('White Lightning'));
  });

  it('falls back to hybrid by type, and to the default otherwise', () => {
    expect(look(undefined, { type: 'hybrid' }).smoke).toBeLessThan(0.1);
    expect(look('Classic')).toBe(DEFAULT_EXHAUST);
    expect(look()).toBe(DEFAULT_EXHAUST);
    expect(exhaustFor(undefined)).toBe(DEFAULT_EXHAUST);
  });

  it('adds sparks to any look the catalog calls sparky', () => {
    expect(look('Classic', { sparky: true })).toEqual({ ...DEFAULT_EXHAUST, sparks: true });
  });
});

describe('the looks of a flight', () => {
  const spec = (designation: string) => ({ designation }) as MotorSpec;
  const tree = {
    name: 'R',
    components: [
      { id: 'sus', type: 'stage', children: [{ id: 'm1', type: 'innertube', motorMount: true }] },
      { id: 'boo', type: 'stage', children: [{ id: 'm2', type: 'innertube', motorMount: true }] },
    ],
  } as unknown as RocketTree;
  const catalog = [
    { designation: 'H128', propInfo: 'White Lightning' },
    { designation: 'G64', propInfo: 'Blackjack' },
  ] as CatalogMotor[];
  const find = (c: CatalogMotor[], s: MotorSpec) => c.find((m) => m.designation === s.designation);

  it('lists the stages in burn order, the booster first', () => {
    const config = { motors: { m1: { spec: spec('G64') }, m2: { spec: spec('H128') } } } as unknown as FlightConfig;
    expect(burnExhausts(tree, config, catalog, find)).toEqual([look('White Lightning'), look('Blackjack')]);
  });

  it('skips a stage with nothing seated, and gives an unknown motor the default', () => {
    const config = { motors: { m1: { spec: spec('Z9') } } } as unknown as FlightConfig;
    expect(burnExhausts(tree, config, catalog, find)).toEqual([DEFAULT_EXHAUST]);
  });
});

describe('the looks by name', () => {
  it('names the look a motor takes, and lists every look once, the default first', () => {
    expect(exhaustIdFor({ propInfo: 'Blue Thunder' })).toBe('blue');
    expect(exhaustIdFor({ type: 'hybrid' })).toBe('hybrid');
    expect(exhaustIdFor(undefined)).toBe('classic');
    expect(EXHAUST_LOOKS.map((l) => l.id)).toEqual([...EXHAUST_IDS]);
    expect(EXHAUST_LOOKS[0]!.look).toBe(DEFAULT_EXHAUST);
  });
});
