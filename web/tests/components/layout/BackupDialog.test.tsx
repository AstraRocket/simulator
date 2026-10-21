// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { LocalStorageKeyValueStore } from '../../../src/services/storage/keyValueStore';
import {
  KeyValueMaterialStore,
  setMaterialStore,
  getMaterialStore,
} from '../../../src/services/materials/materialStore';
import { KeyValuePresetStore, setPresetStore } from '../../../src/services/parts/presetStore';
import { KeyValueLaunchLocationStore, setLaunchLocationStore } from '../../../src/services/storage/launchLocationStore';
import { KeyValueMotorStore, setMotorStore } from '../../../src/services/motors/motorStore';
import { KeyValueTemplateStore, setTemplateStore } from '../../../src/services/exports/templateStore';

const saved = vi.hoisted(() => ({ text: '', name: '' }));
vi.mock('../../../src/services/files/saveFile', async (orig) => ({
  ...(await orig<typeof import('../../../src/services/files/saveFile')>()),
  saveText: async (text: string, name: string) => {
    saved.text = text;
    saved.name = name;
  },
}));

const { BackupDialog } = await import('../../../src/components/layout/BackupDialog');

/** Export ▸ Backup and Import ▸ Backup, over the browser's stores (services/storage/backup.ts holds the rules). */

beforeEach(() => {
  localStorage.clear();
  const kv = new LocalStorageKeyValueStore();
  setMaterialStore(new KeyValueMaterialStore(undefined, kv));
  setPresetStore(new KeyValuePresetStore(undefined, kv));
  setLaunchLocationStore(new KeyValueLaunchLocationStore(undefined, kv));
  setMotorStore(new KeyValueMotorStore(kv));
  setTemplateStore(new KeyValueTemplateStore(undefined, kv));
  saved.text = '';
});

const dialog = (name: string) => screen.getByRole('dialog', { name });

describe('Export ▸ Backup and Import ▸ Backup', () => {
  it('saves the chosen libraries, and the restore puts them back, saying what each one did', async () => {
    await getMaterialStore().add({ name: 'G10', type: 'bulk', density: 1800, group: 'Composites' });
    const { unmount } = renderWithProviders(<BackupDialog mode="backup" onClose={() => {}} />);
    const backup = dialog('Backup');
    await waitFor(() => expect(within(backup).getByText('(1)')).toBeTruthy());
    // Each half shows only its own controls.
    expect(within(backup).queryByRole('button', { name: 'Open backup file…' })).toBeNull();
    fireEvent.click(within(backup).getByRole('button', { name: 'Save backup file' }));
    await waitFor(() => expect(screen.getByText('Backup saved.')).toBeTruthy());
    expect(saved.name).toMatch(/^astrarocket-backup-\d{4}-\d{2}-\d{2}\.json$/);
    unmount();

    await getMaterialStore().remove('G10', 'bulk');
    renderWithProviders(<BackupDialog mode="restore" onClose={() => {}} />);
    const restore = dialog('Restore backup');
    expect(within(restore).queryByRole('button', { name: 'Save backup file' })).toBeNull();
    const input = within(restore).getByLabelText('Open backup file…') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([saved.text], 'b.json', { type: 'application/json' })] } });
    await waitFor(() => expect(within(restore).getByRole('button', { name: 'Restore' })).toBeTruthy());
    fireEvent.click(within(restore).getByRole('button', { name: 'Restore' }));
    await waitFor(() =>
      expect(within(restore).getByText('Custom Materials: 1 added, 0 replaced, 0 refused')).toBeTruthy(),
    );
    expect(within(restore).getByText('Settings: restored')).toBeTruthy();
    expect((await getMaterialStore().list()).map((m) => m.name)).toEqual(['G10']);
  });

  it('offers every library on both sides, in alphabetical order, and skips one the file lacks', async () => {
    const names = () =>
      screen.getAllByRole('checkbox').map((c) => c.closest('label')!.textContent!.replace(/\s*\(.*\)$/, ''));
    const order = [
      'Custom Materials',
      'Custom Parts',
      'Flight Path Templates',
      'Imported Motors',
      'Launch Locations',
      'Settings',
    ];
    const { unmount } = renderWithProviders(<BackupDialog mode="backup" onClose={() => {}} />);
    expect(names()).toEqual(order);
    unmount();

    renderWithProviders(<BackupDialog mode="restore" onClose={() => {}} />);
    expect(names()).toEqual(order);
    // Nothing to choose until a file says what it holds.
    expect(screen.getAllByRole('checkbox').every((c) => (c as HTMLInputElement).disabled)).toBe(true);
    const file = JSON.stringify({ format: 'astrarocket-backup', version: 1, app: '1', created: '', parts: [] });
    const input = within(dialog('Restore backup')).getByLabelText('Open backup file…') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([file], 'b.json')] } });
    const materials = await screen.findByRole('checkbox', { name: /Custom Materials/ });
    await waitFor(() => expect((materials as HTMLInputElement).disabled).toBe(true));
    expect(within(dialog('Restore backup')).getByText('Custom Materials').closest('label')!.textContent).toContain(
      'not in this backup',
    );
    const parts = screen.getByRole('checkbox', { name: /Custom Parts/ }) as HTMLInputElement;
    expect([parts.disabled, parts.checked]).toEqual([false, true]);
    expect((materials as HTMLInputElement).checked).toBe(false);
  });

  it('says so when the file is not a backup', async () => {
    renderWithProviders(<BackupDialog mode="restore" onClose={() => {}} />);
    const input = within(dialog('Restore backup')).getByLabelText('Open backup file…') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['{"a":1}'], 'x.json')] } });
    await waitFor(() => expect(screen.getByText('This is not a backup file from this app.')).toBeTruthy());
    expect(
      (within(dialog('Restore backup')).getByRole('button', { name: 'Restore' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
