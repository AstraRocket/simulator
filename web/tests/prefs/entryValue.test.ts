import { describe, it, expect } from 'vitest';
import { SI_LIMITS, clampEntry, onSi, parseEntry, siEntry } from '../../src/prefs/entryValue';

// Not rendered: jsdom refuses "1e999" in a number input, so a rendered test passes wrongly.
describe('clampEntry', () => {
  it('passes a finite number through', () => {
    expect(clampEntry(2.5)).toBe(2.5);
  });

  it('refuses blank and unparseable values', () => {
    expect(clampEntry(null)).toBeNull();
    expect(clampEntry(undefined)).toBeNull();
    expect(clampEntry(NaN)).toBeNull();
  });

  // `Infinity < min` is false.
  it('refuses an infinity that a bare clamp would let through', () => {
    expect(clampEntry(Infinity, 0)).toBeNull();
    expect(clampEntry(-Infinity, 0)).toBeNull();
    expect(clampEntry(Infinity, 0, 10)).toBeNull();
  });

  it('clamps to the declared bounds', () => {
    expect(clampEntry(-5, 0)).toBe(0);
    expect(clampEntry(99, 0, 10)).toBe(10);
  });
});

describe('parseEntry', () => {
  it('reads a typed number', () => {
    expect(parseEntry('12.5')).toBe(12.5);
  });

  it('refuses an empty or whitespace-only box', () => {
    expect(parseEntry('')).toBeNull();
    expect(parseEntry('   ')).toBeNull();
  });

  it('refuses text that overflows a double', () => {
    expect(parseEntry('1e999')).toBeNull();
    expect(parseEntry('-1e999')).toBeNull();
  });

  it('refuses text that is not a number at all', () => {
    expect(parseEntry('abc')).toBeNull();
  });
});

describe('siEntry', () => {
  it('converts the user unit to SI', () => {
    expect(siEntry('length', 'mm', 25)).toBeCloseTo(0.025, 12);
  });

  it('refuses a blank entry', () => {
    expect(siEntry('length', 'mm', null)).toBeNull();
  });

  it('refuses an entry that is finite typed and infinite in SI', () => {
    expect(Number.isFinite(1e306)).toBe(true);
    expect(siEntry('distance', 'km', 1e306)).toBeNull();
    expect(siEntry('density', 'g/cm³', 1e306)).toBeNull();
  });

  it('applies a quantity-level SI ceiling', () => {
    expect(SI_LIMITS.density?.max).toBe(30_000);
    expect(siEntry('density', 'g/cm³', 1e6)).toBe(30_000);
    expect(siEntry('density', 'g/cm³', 22.59)).toBeCloseTo(22_590, 6);
  });

  it('checks the chained leg for a value whose stored form is not SI', () => {
    expect(siEntry('angle', '°', 45, (si) => (si * 180) / Math.PI)).toBeCloseTo(45, 9);
    expect(siEntry('length', 'm', 1e300, (si) => si * 1e300)).toBeNull();
  });

  it('refuses a NaN chained result rather than storing it', () => {
    expect(siEntry('length', 'm', 1, () => NaN)).toBeNull();
  });
});

describe('onSi', () => {
  const mm = {
    toSi: (ui: number | null | undefined, then?: (si: number) => number) => siEntry('length', 'mm', ui, then),
  };

  it('reports a cleared box, because clearing one is a real edit', () => {
    const seen: (number | null)[] = [];
    onSi(mm, (si) => seen.push(si))(null);
    expect(seen).toEqual([null]);
  });

  it('hands the callback SI', () => {
    const seen: (number | null)[] = [];
    onSi(mm, (si) => seen.push(si))(25);
    expect(seen).toEqual([0.025]);
  });

  it('does not call the callback at all for a value it cannot store', () => {
    const km = {
      toSi: (ui: number | null | undefined, then?: (si: number) => number) => siEntry('distance', 'km', ui, then),
    };
    const seen: (number | null)[] = [];
    onSi(km, (si) => seen.push(si))(1e306);
    expect(seen).toEqual([]);
  });

  it('passes the chained leg through', () => {
    const seen: (number | null)[] = [];
    onSi(
      mm,
      (si) => seen.push(si),
      (si) => si * 2,
    )(25);
    expect(seen).toEqual([0.05]);
  });
});
