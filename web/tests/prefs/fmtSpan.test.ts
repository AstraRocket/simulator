import { describe, expect, it } from 'vitest';
import { fmtSpan } from '../../src/prefs/useUnits';

// The site map's scale bar: 100 px is about 478 m at the default zoom.
describe('fmtSpan', () => {
  it('reads a short span in m or ft for km and mi users, never "0 km"', () => {
    expect(fmtSpan('km', 478)).toBe('478 m');
    expect(fmtSpan('mi', 478)).toBe('1,568 ft');
  });

  it('reads a long span in the far unit', () => {
    expect(fmtSpan('m', 2500)).toBe('2.5 km');
    expect(fmtSpan('ft', 3218.688)).toBe('2.0 mi');
    expect(fmtSpan('yd', 3218.688)).toBe('2.0 mi');
  });

  it('keeps yards for a short span in yards', () => {
    expect(fmtSpan('yd', 91.44)).toBe('100 yd');
  });
});
