import { describe, expect, it } from 'vitest';
import type { WeatherSource } from '../../../src/services/design/orkTree';
import { PROPOSAL_GROUPS, proposalPatch, type WeatherProposal } from '../../../src/services/weather/weatherProposal';
import { sourceFields } from '../../../src/services/weather/weatherSource';

/**
 * The fields a source says it speaks for are the fields applying its groups
 * wrote. Two lists of the same thing (`GROUP_FIELDS` and the patch's writes)
 * held together here rather than merged: the patch rounds each field its own
 * way, and a loop over the list would hide that.
 */
describe('weather group fields', () => {
  const full: WeatherProposal = {
    temperatureC: 15,
    pressureHPa: 1013,
    relativeHumidity: 0.5,
    wind: { surfaceSpeed: 3, surfaceFromDeg: 270, surfaceStdDev: 0.5, gust: null, levels: [] },
    atmosphere: [{ altitudeM: 100, temperatureC: 14, pressureHPa: 1000 } as never],
  };

  it.each(PROPOSAL_GROUPS)('a source applied for %s names what the patch writes', (group) => {
    const written = Object.keys(proposalPatch(full, new Set([group]))).sort();
    const named = sourceFields({ groups: [group], elevationApplied: false } as unknown as WeatherSource);
    expect([...named].sort()).toEqual(written);
  });
});
