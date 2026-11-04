// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import i18n from '../../../src/i18n';
import { StabilityTable } from '../../../src/components/canvas/AeroComponentTables';
import { renderWithProviders } from '../../testing/renderWithProviders';
import type { AeroSweep } from '../../../src/engine/openRocketEngine';

const sweep = {
  machs: [0.3],
  hasNozzle: false,
  cp: [0.4],
  cna: [10],
  components: [
    { key: 'n', name: 'Nose cone', cd: [0.1], cna: [2], cp: [0.05] },
    { key: 'f', name: 'Fins', cd: [0.2], cna: [8], cp: [0.5] },
  ],
} as unknown as AeroSweep;

const renderTable = () =>
  renderWithProviders(
    <StabilityTable
      sweep={sweep}
      machs={[0.3]}
      mach={0.3}
      masses={[]}
      lengthUnit="m"
      lengthFactor={1}
      massUnit="g"
      massFactor={1000}
      bodyLen={0.6}
      aeroLen={0.55}
    />,
  );

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('StabilityTable', () => {
  it('labels the CP percentage columns with the same words as the chart toggle', async () => {
    await i18n.changeLanguage('de');
    renderTable();
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toContain(`CP (${i18n.t('aero.pctBody')})`);
    expect(heads).toContain(`CP (${i18n.t('aero.pctLength')})`);
    expect(heads.some((h) => h?.includes('% body'))).toBe(false);
  });

  it("names the CP columns in the reader's language, as the drawings do", async () => {
    for (const lang of ['ru', 'pl']) {
      await i18n.changeLanguage(lang);
      const { unmount } = renderTable();
      const heads = screen.getAllByRole('columnheader').map((h) => h.textContent);
      const cp = i18n.t('schematic.cp');
      expect(cp).not.toBe('CP');
      expect(heads).toContain(`${cp} (m)`);
      expect(heads.some((h) => h?.startsWith('CP ('))).toBe(false);
      unmount();
    }
  });
});

describe('StabilityTable precision', () => {
  const precise = {
    ...sweep,
    components: [{ key: 'f', name: 'Fins', cd: [0.2], cna: [8], cp: [0.523] }],
  } as unknown as AeroSweep;

  it('resolves positions in meters and masses in kilograms', () => {
    renderWithProviders(
      <StabilityTable
        sweep={precise}
        machs={[0.3]}
        mach={0.3}
        masses={[{ key: 'f', name: 'Fins', eachMass: 0.0157, mass: 0.0473, cg: 0.5 }]}
        lengthUnit="m"
        lengthFactor={1}
        massUnit="kg"
        massFactor={1}
        bodyLen={0.6}
        aeroLen={0.55}
      />,
    );
    const cells = screen.getAllByRole('cell').map((c) => c.textContent);
    expect(cells).toContain('0.5230');
    expect(cells).toContain('0.0473');
  });
});

// An unnamed part arrives as the kernel's bundle key.
describe('StabilityTable names', () => {
  it('translates a part the user never named', async () => {
    await i18n.changeLanguage('es');
    const unnamed = {
      ...sweep,
      components: [{ key: 'b', name: '[BodyTube.BodyTube]', cd: [0.1], cna: [2], cp: [0.3] }],
    } as unknown as AeroSweep;
    renderWithProviders(
      <StabilityTable
        sweep={unnamed}
        machs={[0.3]}
        mach={0.3}
        masses={[]}
        lengthUnit="m"
        lengthFactor={1}
        massUnit="g"
        massFactor={1000}
        bodyLen={0.6}
        aeroLen={0.55}
      />,
    );
    expect(screen.getByText(i18n.t('part.bodytube'))).toBeTruthy();
    expect(screen.queryByText('Body Tube')).toBeNull();
  });
});
