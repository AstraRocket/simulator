import { describe, it, expect } from 'vitest';
import { renderUserTemplate, type FlightPathModel } from '../../../src/services/exports/flightPathExport';

describe('CSV escaper and negative numbers', () => {
  const m = { title: '' } as unknown as FlightPathModel;
  const csv = (title: string) => renderUserTemplate('{{title}}', 'csv', { ...m, title });

  it('leaves a negative number alone', () => {
    expect(csv('-80.600000')).toBe('-80.600000');
    expect(csv('-3')).toBe('-3');
    expect(csv('-.5')).toBe('-.5');
  });

  it('still neutralizes the formula triggers', () => {
    expect(csv('=HYPERLINK("x")')).toBe(`'=HYPERLINK(""x"")`);
    expect(csv('+1+1')).toBe(`'+1+1`);
    expect(csv('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(csv('\tcmd')).toBe(`'\tcmd`);
  });

  it('a minus that does not lead a number is still a trigger', () => {
    expect(csv('-cmd|calc')).toBe(`'-cmd|calc`);
    expect(csv('- 1')).toBe(`'- 1`);
  });
});
