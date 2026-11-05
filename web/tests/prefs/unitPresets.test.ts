import { describe, it, expect } from 'vitest';
import { METRIC_UNITS, IMPERIAL_UNITS, UNITS, QUANTITIES } from '../../src/prefs/units';
import type { Quantity } from '../../src/prefs/units';

// Transcribed from engine-java/src/java/info/openrocket/core/unit/UnitGroup.java:422-486.
const DESKTOP_METRIC: Partial<Record<Quantity, string>> = {
  length: 'cm',
  motorDimensions: 'mm',
  distance: 'm',
  area: 'cm²',
  velocity: 'm/s',
  acceleration: 'm/s²',
  mass: 'g',
  angle: '°',
  density: 'g/cm³',
  surfaceDensity: 'g/m²',
  lineDensity: 'g/m',
  force: 'N',
  temperature: '°C',
  windspeed: 'm/s',
  rollRate: 'r/s',
};

const DESKTOP_IMPERIAL: Partial<Record<Quantity, string>> = {
  length: 'in',
  motorDimensions: 'in',
  distance: 'ft',
  area: 'in²',
  velocity: 'ft/s',
  acceleration: 'ft/s²',
  mass: 'oz',
  angle: '°',
  density: 'oz/in³',
  surfaceDensity: 'oz/ft²',
  lineDensity: 'oz/ft',
  temperature: '°F',
  windspeed: 'mph',
  rollRate: 'r/s',
};

const DEVIATIONS: Partial<Record<Quantity, { metric?: string; imperial?: string; why: string }>> = {
  pressure: {
    metric: 'mbar',
    imperial: 'mbar',
    why: 'hPa is mbar under its SI name (both 100 Pa); psi is the imperial unit the desktop forgets to set',
  },
  impulse: {
    metric: 'Ns',
    imperial: 'Ns',
    why: 'N·s is Ns with the dot this file uses everywhere; lbf·s is the imperial unit the desktop forgets to set',
  },
  force: {
    imperial: 'N',
    why: 'the desktop leaves force in newtons in imperial mode, which an Imperial preset should not do',
  },
};

describe('the metric preset is the desktop metric preset', () => {
  it.each(Object.entries(DESKTOP_METRIC) as [Quantity, string][])('%s is %s', (q, sym) => {
    expect(METRIC_UNITS[q]).toBe(sym);
  });
});

describe('the imperial preset is the desktop imperial preset', () => {
  it.each(Object.entries(DESKTOP_IMPERIAL) as [Quantity, string][])('%s is %s', (q, sym) => {
    expect(IMPERIAL_UNITS[q]).toBe(sym);
  });
});

describe('every quantity is accounted for, one way or the other', () => {
  it('leaves no quantity out of both tables', () => {
    const unexplained = QUANTITIES.filter((q) => !(q in DESKTOP_METRIC) && !(q in DEVIATIONS));
    expect(unexplained).toEqual([]);
  });

  it('states a reason for each deviation', () => {
    for (const [q, dev] of Object.entries(DEVIATIONS)) {
      expect(dev.why.length, q).toBeGreaterThan(20);
    }
  });

  it('names a deviation only where the two presets actually differ', () => {
    for (const q of Object.keys(DEVIATIONS) as Quantity[]) {
      const dev = DEVIATIONS[q]!;
      if (dev.metric) expect(METRIC_UNITS[q], q).not.toBe(dev.metric);
      if (dev.imperial) expect(IMPERIAL_UNITS[q], q).not.toBe(dev.imperial);
    }
  });
});

describe('both presets name a unit that exists', () => {
  it.each(QUANTITIES)('%s', (q) => {
    const symbols = UNITS[q].map((u) => u.symbol);
    expect(symbols, `metric ${q}`).toContain(METRIC_UNITS[q]);
    expect(symbols, `imperial ${q}`).toContain(IMPERIAL_UNITS[q]);
  });
});
