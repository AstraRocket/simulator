import { describe, expect, it } from 'vitest';
import { flyerFrom, highestLevel, orgLabel } from '../../../src/services/storage/flyer';
import { settingsFrom } from '../../../src/services/storage/settings';

describe('the flyer as stored', () => {
  it('keeps what is usable and drops the rest', () => {
    const flyer = flyerFrom({
      name: 'Pat',
      memberships: [
        { org: 'nar', number: '12345', level: 2 },
        { org: 'tripoli', number: 9, level: 7 },
        { org: 'other', orgName: 'UKRA', number: 'U-1', level: 1 },
        { org: 'nasa', number: '1', level: 3 },
        'junk',
      ],
    });
    expect(flyer).toEqual({
      name: 'Pat',
      memberships: [
        { org: 'nar', orgName: '', number: '12345', level: 2 },
        { org: 'tripoli', orgName: '', number: '', level: 0 },
        { org: 'other', orgName: 'UKRA', number: 'U-1', level: 1 },
      ],
    });
  });

  it('starts empty, in settings with none stored', () => {
    expect(settingsFrom({}).flyer).toEqual({ name: '', memberships: [] });
    expect(flyerFrom(null)).toEqual({ name: '', memberships: [] });
  });

  it('names a membership by its organization, and takes the highest level held', () => {
    const flyer = flyerFrom({
      memberships: [
        { org: 'car', number: '7', level: 1 },
        { org: 'other', orgName: ' UKRA ', number: '8', level: 2 },
      ],
    });
    expect(flyer.memberships.map(orgLabel)).toEqual(['CAR', 'UKRA']);
    expect(highestLevel(flyer)).toBe(2);
    expect(highestLevel({ name: '', memberships: [] })).toBeNull();
  });
});
