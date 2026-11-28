import { describe, expect, it } from 'vitest';
import type { FlightSummary } from '../../../src/engine/openRocketEngine';
import {
  DEFAULT_SIM_COLS,
  RESULT_COLUMNS,
  SIM_COLUMN_IDS,
  movedBy,
  movedTo,
  normalizeCols,
} from '../../../src/components/sim/simColumns';

const summary: FlightSummary = {
  maxAltitude: 300,
  maxVelocity: 90,
  maxAcceleration: 120,
  maxMachNumber: 0.27,
  timeToApogee: 8,
  flightTime: 40,
  groundHitVelocity: 5,
  launchRodVelocity: 15,
  deploymentVelocity: 10,
  optimumDelay: 5,
};

const FROM_FLIGHT = ['maxQ', 'maxQAlpha', 'maxRoll', 'exitTime', 'exitTwr', 'exitMargin', 'exitAoa', 'downrange'];

describe('simulation table columns', () => {
  it('offers every summary figure and every figure the results panel works out', () => {
    expect(SIM_COLUMN_IDS).toEqual(expect.arrayContaining([...DEFAULT_SIM_COLS, ...FROM_FLIGHT, 'maxWind']));
    expect(new Set(SIM_COLUMN_IDS).size).toBe(SIM_COLUMN_IDS.length);
  });

  it('leaves the flight-data columns empty for a stored summary, and fills the rest from it', () => {
    for (const col of RESULT_COLUMNS) {
      const v = col.value(summary, null);
      if (FROM_FLIGHT.includes(col.id)) expect(v, col.id).toBeNull();
      else if (col.id !== 'railNeeded') expect(Number.isFinite(v), col.id).toBe(true);
    }
  });

  it('moves a column onto another: before it going left, after it going right', () => {
    const order = ['status', 'name', 'config', 'apogee'];
    expect(movedTo(order, 'apogee', 'name')).toEqual(['status', 'apogee', 'name', 'config']);
    expect(movedTo(order, 'status', 'config')).toEqual(['name', 'config', 'status', 'apogee']);
    expect(movedTo(order, 'apogee', 'nope')).toEqual(order);
  });

  it('swaps a column with its neighbor and leaves it at either end', () => {
    const order = ['status', 'name', 'apogee'];
    expect(movedBy(order, 'name', 1)).toEqual(['status', 'apogee', 'name']);
    expect(movedBy(order, 'name', -1)).toEqual(['name', 'status', 'apogee']);
    expect(movedBy(order, 'status', -1)).toEqual(order);
    expect(movedBy(order, 'apogee', 1)).toEqual(order);
  });

  it('keeps a saved order, drops unknown and repeated ids, and puts the name back where it sat', () => {
    expect(normalizeCols(['apogee', 'name', 'status'])).toEqual(['apogee', 'name', 'status']);
    expect(normalizeCols(['status', 'config', 'gone', 'config'])).toEqual(['status', 'name', 'config']);
    expect(normalizeCols(['apogee'])).toEqual(['name', 'apogee']);
  });
});
