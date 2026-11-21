// @vitest-environment jsdom
// cspell:ignore stabilitylookupcsv -- OpenRocket .ork element name
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { download } from '../../../src/services/files/saveFile';

vi.mock('../../../src/services/files/saveFile', async (real) => ({
  ...(await real<typeof import('../../../src/services/files/saveFile')>()),
  download: vi.fn(),
}));
import { AeroTableRows } from '../../../src/components/sim/AeroTableRows';
import { AeroRangeWarningRows } from '../../../src/components/sim/AeroRangeWarningRows';
import { useWorkspaceStore, selectActive } from '../../../src/state/store';
import { aeroTablesOf } from '../../../src/services/flight/aeroTables';
import { renderWithProviders } from '../../testing/renderWithProviders';

const s = () => useWorkspaceStore.getState();
const active = () => selectActive(s());
const upload = (label: string, text: string, name = 'aero.csv') =>
  fireEvent.change(screen.getByLabelText(label, { selector: 'input' }), {
    target: { files: [new File([text], name, { type: 'text/csv' })] },
  });

describe('AeroTableRows', () => {
  beforeEach(() => s().resetWorkspace());

  it('flies an uploaded CSV and names it, until removed', async () => {
    renderWithProviders(<AeroTableRows multi={false} />);
    expect(screen.getAllByText('For example:')).toHaveLength(2);
    expect(screen.getByText(/^mach,cd\s+0\.1,0\.45/)).toBeTruthy();
    upload('Drag table', 'mach,cd\n0.3,0.35\n', 'drag.csv');
    await waitFor(() => expect(aeroTablesOf(active().xmlExtra).dragLookup).toEqual(['mach,cd', '0.3,0.35']));
    expect(screen.getByText('drag.csv · Mach 0.3 to 0.3')).toBeTruthy();
    expect(screen.getAllByText('For example:')).toHaveLength(1);
    expect(screen.getByText(/cp is the center of pressure in meters from the nose tip/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Drag table, Remove' }));
    expect(active().xmlExtra).toBeUndefined();
  });

  it('shows the table and downloads it', async () => {
    renderWithProviders(<AeroTableRows multi={false} />);
    upload('Drag table', 'mach,cd\n0.3,0.35\n', 'drag.csv');
    const show = await screen.findByRole('button', { name: 'Drag table, Show' });
    fireEvent.click(show);
    expect(show.getAttribute('aria-expanded')).toBe('true');
    const table = screen.getByRole('table', { name: 'Drag table' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['mach', 'cd']);
    expect(
      within(table)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['0.3', '0.35']);

    fireEvent.click(screen.getByRole('button', { name: 'Drag table, Download' }));
    expect(vi.mocked(download)).toHaveBeenCalledWith('drag.csv', expect.any(Blob));
  });

  it('says why a file was refused and changes nothing', async () => {
    renderWithProviders(<AeroTableRows multi={false} />);
    upload('Stability table', 'mach,cn,cp\n0.3,0.1,0.4', 'cn.csv');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not use cn.csv: The header has no cm column. Check the column names and that fields are separated by commas, semicolons or tabs.',
    );
    expect(active().xmlExtra).toBeUndefined();
  });

  it('asks for the CSV a desktop file only names', () => {
    useWorkspaceStore.setState((st) => ({
      sims: st.sims.map((x) =>
        x.id === st.activeId
          ? { ...x, xmlExtra: ['<conditions><stabilitylookupcsv>/home/a/cn.csv</stabilitylookupcsv></conditions>'] }
          : x,
      ),
    }));
    renderWithProviders(<AeroTableRows multi={false} />);
    expect(screen.getByText(/\/home\/a\/cn\.csv is a file on desktop OpenRocket's computer/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stability table, Replace' })).toBeTruthy();
  });
});

describe('AeroRangeWarningRows', () => {
  it('says where the flight left the table, with its numbers', () => {
    renderWithProviders(
      <ul>
        <AeroRangeWarningRows findings={[{ kind: 'drag', quantity: 'mach', max: 0.8, flown: 1.234 }]} />
      </ul>,
    );
    expect(screen.getByRole('listitem').textContent).toContain(
      'Drag table ends at Mach 0.8, but this flight reaches Mach 1.23.',
    );
  });
});
