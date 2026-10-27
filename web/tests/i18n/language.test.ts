import { describe, expect, it } from 'vitest';
import { baseLanguage } from '../../src/i18n/language';

describe('baseLanguage', () => {
  it('reads the base of a regional tag, lowercase', () => {
    expect(baseLanguage('es-MX')).toBe('es');
    expect(baseLanguage('EN')).toBe('en');
  });

  it('keeps a three-letter base whole', () => {
    expect(baseLanguage('fil-PH')).toBe('fil');
  });

  it('reads an empty or missing tag as empty', () => {
    expect(baseLanguage('')).toBe('');
    expect(baseLanguage(undefined)).toBe('');
  });
});
