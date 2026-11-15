// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, seedSettings } from '../../testing/renderWithProviders';
import { GuideResults, type GuideCol, type GuideRowBase } from '../../../src/components/sim/GuideResults';
import { METRIC_UNITS } from '../../../src/prefs/units';
import type { CatalogMotor } from '../../../src/services/motors/motorDb';

interface Row extends GuideRowBase {
  apogee: number;
}

const row: Row = {
  key: 'h128',
  motor: { designation: 'H128', commonName: 'H128', manufacturer: 'AeroTech' } as unknown as CatalogMotor,
  apogee: 410,
};

const render = (cols: GuideCol<Row>[]) =>
  renderWithProviders(
    <GuideResults<Row>
      rows={[row]}
      failed={[]}
      cols={cols}
      colLabel={(c) => c.label}
      sort={{ key: 'apogee', desc: true }}
      onSort={() => {}}
      descFirst={() => true}
      statusSorts={false}
      status={() => null}
      pick={() => null}
      cards={false}
    />,
  );

afterEach(() => localStorage.clear());

describe('the guide table', () => {
  it("prints a figure with a chip scope in that chip's unit", () => {
    seedSettings({ units: METRIC_UNITS, unitOverrides: { 'sim.apogee': 'ft' } });
    render([
      { id: 'apogee', label: 'Apogee', quantity: 'distance', scope: 'sim.apogee', value: (r) => r.apogee },
      { id: 'plain', label: 'Plain', quantity: 'distance', value: (r) => r.apogee },
    ]);
    const cells = screen.getAllByRole('cell').map((c) => c.textContent);
    // 410 m is 1345.1 ft.
    expect(cells.some((c) => /^1\D?345(\.\d+)?$/.test(c ?? ''))).toBe(true);
    expect(cells).toContain('410');
  });
});
