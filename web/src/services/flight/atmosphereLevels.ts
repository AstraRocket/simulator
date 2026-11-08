import type { AtmosphereLevel } from '../design/orkTree';

// The bridge (AtmosphereProfile) fails the whole run on a bad level, so bad levels are dropped here.

const KEYS = ['altitudeM', 'temperatureC', 'pressureHPa', 'relativeHumidity'] as const;

function isUsableAtmosphereLevel(l: unknown): l is AtmosphereLevel {
  if (!l || typeof l !== 'object') return false;
  const r = l as Record<string, unknown>;
  if (!KEYS.every((k) => Number.isFinite(r[k]))) return false;
  const v = l as AtmosphereLevel;
  return v.temperatureC > -273.15 && v.pressureHPa > 0 && v.relativeHumidity >= 0 && v.relativeHumidity <= 1;
}

export function usableAtmosphereLevels(levels: readonly unknown[]): AtmosphereLevel[] {
  const sorted = levels.filter(isUsableAtmosphereLevel).sort((a, b) => a.altitudeM - b.altitudeM);
  const kept: AtmosphereLevel[] = [];
  for (const l of sorted) {
    const prev = kept[kept.length - 1];
    if (prev && !(l.altitudeM > prev.altitudeM && l.pressureHPa < prev.pressureHPa)) continue;
    kept.push({
      altitudeM: l.altitudeM,
      temperatureC: l.temperatureC,
      pressureHPa: l.pressureHPa,
      relativeHumidity: l.relativeHumidity,
    });
  }
  return kept;
}
