// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { UnitChip } from '../../../src/components/common/UnitChip';
import { renderWithProviders, seedSettings, readSettings } from '../../testing/renderWithProviders';
import { unitScope } from '../../../src/prefs/units';

const SCOPE = unitScope('prop', 'nosecone', 'length');
const OTHER = unitScope('prop', 'nosecone', 'thickness');

const chip = () => screen.getByRole('combobox') as HTMLSelectElement;
const overrides = () => (readSettings().unitOverrides ?? {}) as Record<string, string>;

describe('UnitChip', () => {
  beforeEach(() => localStorage.clear());

  it('shows the preference when the field has no unit of its own', () => {
    renderWithProviders(<UnitChip quantity="length" scope={SCOPE} />);
    expect(chip().value).toBe('cm');
  });

  it('writes the chosen unit against its own scope, and nothing else', () => {
    seedSettings({ unitOverrides: { [OTHER]: 'mm' } });
    renderWithProviders(<UnitChip quantity="length" scope={SCOPE} />);

    fireEvent.change(chip(), { target: { value: 'in' } });

    expect(overrides()).toEqual({ [OTHER]: 'mm', [SCOPE]: 'in' });
  });

  it('REMOVES the override when the preference unit is picked back', () => {
    seedSettings({ unitOverrides: { [SCOPE]: 'in' } });
    renderWithProviders(<UnitChip quantity="length" scope={SCOPE} />);

    fireEvent.change(chip(), { target: { value: 'cm' } });

    expect(SCOPE in overrides()).toBe(false);
  });

  it('marks an overridden field in its accessible name, not only in color', () => {
    seedSettings({ unitOverrides: { [SCOPE]: 'in' } });
    renderWithProviders(<UnitChip quantity="length" scope={SCOPE} />);

    expect(chip().getAttribute('aria-label')).toBe('Component dimensions unit, set for this field');
    expect(chip().className).toContain('text-warn-400');
  });

  it('names a field that follows the preference without qualification', () => {
    renderWithProviders(<UnitChip quantity="length" scope={SCOPE} />);

    expect(chip().getAttribute('aria-label')).toBe('Component dimensions unit');
    expect(chip().className).toContain('text-ink-faint');
  });

  it('offers only the units its quantity defines', () => {
    renderWithProviders(<UnitChip quantity="motorDimensions" scope={unitScope('motor', 'dia')} />);

    const options = [...chip().options].map((o) => o.value);
    expect(options).toEqual(['mm', 'cm', 'in']);
  });

  it('ignores a stored unit that does not belong to its quantity', () => {
    seedSettings({ unitOverrides: { [SCOPE]: 'oz' } });
    renderWithProviders(<UnitChip quantity="length" scope={SCOPE} />);

    expect(chip().value).toBe('cm');
  });
});
