// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageKeyValueStore } from '../../../src/services/storage/keyValueStore';
import {
  KeyValueMaterialStore,
  setMaterialStore,
  getMaterialStore,
} from '../../../src/services/materials/materialStore';
import {
  KeyValuePresetStore,
  setPresetStore,
  getPresetStore,
  type CustomPart,
} from '../../../src/services/parts/presetStore';
import {
  KeyValueLaunchLocationStore,
  setLaunchLocationStore,
  getLaunchLocationStore,
} from '../../../src/services/storage/launchLocationStore';
import {
  KeyValueMotorStore,
  setMotorStore,
  getMotorStore,
  type CustomMotor,
} from '../../../src/services/motors/motorStore';
import { KeyValueTemplateStore, setTemplateStore, getTemplateStore } from '../../../src/services/exports/templateStore';
import { DEFAULT_SETTINGS, type Settings } from '../../../src/services/storage/settings';
import {
  BACKUP_LIBRARIES,
  makeBackup,
  readBackup,
  restoreBackup,
  type BackupLibrary,
} from '../../../src/services/storage/backup';

/**
 * Backup and restore: one file holding the browser's libraries, read back
 * through each store's own guard and merged by each library's identity.
 */

const ALL = new Set<BackupLibrary>(BACKUP_LIBRARIES);

const part = (partNo: string, id = `custom:${partNo}`): CustomPart => ({
  id,
  type: 'bodytube',
  mfr: 'Mine',
  partNo,
  desc: '',
  node: { length: 0.2, outerRadius: 0.013, thickness: 0.0005, density: 680, materialName: 'Cardboard' },
});

const motor: CustomMotor = {
  id: 'custom:Acme:C6',
  designation: 'C6',
  manufacturer: 'Acme',
  class: 'C',
  diameter: 18,
  length: 70,
  totalWeightG: 24,
  propWeightG: 12,
  samples: [
    { time: 0, thrust: 0 },
    { time: 0.5, thrust: 10 },
    { time: 1.5, thrust: 0 },
  ],
  source: 'eng',
};

/** Fresh stores over localStorage, as a new browser would have. */
function freshStores() {
  localStorage.clear();
  const kv = new LocalStorageKeyValueStore();
  setMaterialStore(new KeyValueMaterialStore(undefined, kv));
  setPresetStore(new KeyValuePresetStore(undefined, kv));
  setLaunchLocationStore(new KeyValueLaunchLocationStore(undefined, kv));
  setMotorStore(new KeyValueMotorStore(kv));
  setTemplateStore(new KeyValueTemplateStore(undefined, kv));
}

async function fillStores() {
  await getMaterialStore().add({ name: 'G10', type: 'bulk', density: 1800, group: 'Composites' });
  await getPresetStore().add(part('BT-1'));
  await getLaunchLocationStore().save({
    id: 'loc-1',
    name: 'Club field',
    latitudeDeg: 42,
    longitudeDeg: -71,
    launchAltitudeM: 50,
  });
  await getMotorStore().addCustomMotors([motor]);
  await getTemplateStore().add({ id: 'w.kml.mustache', name: 'w', ext: 'kml', source: '{{x}}' });
}

const custom: Settings = { ...structuredClone(DEFAULT_SETTINGS), askWhereToSave: !DEFAULT_SETTINGS.askWhereToSave };

beforeEach(freshStores);

describe('a backup file', () => {
  it('carries every library and restores into an empty browser, settings included', async () => {
    await fillStores();
    const text = await makeBackup(ALL, custom);

    freshStores();
    let applied: Settings | null = null;
    const result = await restoreBackup(readBackup(text), ALL, (s) => (applied = s));

    expect(result).toEqual({
      materials: { added: 1, replaced: 0, refused: 0 },
      parts: { added: 1, replaced: 0, refused: 0 },
      locations: { added: 1, replaced: 0, refused: 0 },
      motors: { added: 1, replaced: 0, refused: 0 },
      templates: { added: 1, replaced: 0, refused: 0 },
      settings: { added: 0, replaced: 1, refused: 0 },
    });
    expect((await getMaterialStore().list()).map((m) => m.name)).toEqual(['G10']);
    expect((await getPresetStore().list()).map((p) => p.partNo)).toEqual(['BT-1']);
    expect((await getLaunchLocationStore().list()).map((p) => p.name)).toEqual(['Club field']);
    expect(await getMotorStore().listCustomMotors()).toEqual([motor]);
    expect((await getTemplateStore().list()).map((t) => t.id)).toEqual(['w.kml.mustache']);
    expect(applied!.askWhereToSave).toBe(custom.askWhereToSave);
  });

  it('holds only the libraries chosen', async () => {
    await fillStores();
    const read = readBackup(await makeBackup(new Set(['parts', 'locations']), custom));
    expect(Object.keys(read.entries).sort()).toEqual(['locations', 'parts']);
  });

  it('merges by each library’s identity: a saved part by its type, maker and part number', async () => {
    await fillStores();
    const text = await makeBackup(ALL, custom);
    // The same part saved again here under another id, and a second part.
    freshStores();
    await getPresetStore().add(part('BT-1', 'custom:here'));
    await getPresetStore().add(part('BT-2'));
    const result = await restoreBackup(readBackup(text), new Set(['parts']), () => {});
    expect(result.parts).toEqual({ added: 0, replaced: 1, refused: 0 });
    const stored = await getPresetStore().list();
    expect(stored.map((p) => [p.partNo, p.id]).sort()).toEqual([
      ['BT-1', 'custom:here'],
      ['BT-2', 'custom:BT-2'],
    ]);
  });

  it('refuses the entries its store would refuse, and keeps the rest', async () => {
    const text = JSON.stringify({
      format: 'astrarocket-backup',
      version: 1,
      app: '0.0.0',
      created: '2026-10-18T00:00:00.000Z',
      materials: [
        { name: 'Good', type: 'bulk', density: 500, group: 'Woods' },
        { name: 'Weightless', type: 'bulk', density: 0, group: 'Woods' },
      ],
      // A part the picker could not list: no dimensions.
      parts: [part('BT-1'), { ...part('BT-9'), node: {} }],
      locations: [{ id: 'x', name: 'Off the map', latitudeDeg: 95, longitudeDeg: 0, launchAltitudeM: null }],
      settings: 'not settings',
    });
    const result = await restoreBackup(readBackup(text), ALL, () => {});
    expect(result.materials).toEqual({ added: 1, replaced: 0, refused: 1 });
    expect(result.parts).toEqual({ added: 1, replaced: 0, refused: 1 });
    expect(result.locations).toEqual({ added: 0, replaced: 0, refused: 1 });
    expect(await getLaunchLocationStore().list()).toEqual([]);
  });

  it('refuses a file that is not a backup of this app, and one from a newer layout', () => {
    expect(() => readBackup('not json')).toThrow(expect.objectContaining({ key: 'errors.backup.notBackup' }));
    expect(() => readBackup('{"format":"something-else","version":1}')).toThrow(
      expect.objectContaining({ key: 'errors.backup.notBackup' }),
    );
    expect(() => readBackup('{"format":"astrarocket-backup","version":2,"app":"9.0.0"}')).toThrow(
      expect.objectContaining({ key: 'errors.backup.newer', values: { app: '9.0.0' } }),
    );
  });
});
