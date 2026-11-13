// Security: API keys (userKey.ts) are never included; credentials do not belong in a shared file.
import { APP_VERSION } from '../app/appInfo';
import { KeyedError } from '../../i18n/keyedError';
import { isMaterial, getMaterialStore, materialId } from '../materials/materialStore';
import { addCustomMaterials } from '../materials/materials';
import type { Material } from '../materials/materialTypes';
import { getPresetStore, isCustomPart, type CustomPart } from '../parts/presetStore';
import { addSavedParts, customPartToRow, savedPartKey } from '../parts/customParts';
import { getLaunchLocationStore, isLocation, type LaunchLocation } from './launchLocationStore';
import { getMotorStore, isCustomMotor, type CustomMotor } from '../motors/motorStore';
import { getTemplateStore, isUserTemplate, type UserTemplate } from '../exports/templateStore';
import { settingsFrom, type Settings } from './settings';
import { isRecord } from '../app/numbers';

const BACKUP_FORMAT = 'astrarocket-backup';
const BACKUP_VERSION = 1;

export const BACKUP_LIBRARIES = ['materials', 'parts', 'locations', 'motors', 'templates', 'settings'] as const;
export type BackupLibrary = (typeof BACKUP_LIBRARIES)[number];

interface BackupLists {
  materials: Material[];
  parts: CustomPart[];
  locations: LaunchLocation[];
  motors: CustomMotor[];
  templates: UserTemplate[];
}

export type Backup = Partial<BackupLists> & {
  format: typeof BACKUP_FORMAT;
  version: number;
  app: string;
  created: string;
  settings?: Settings;
};

/** Entries are raw and unvalidated. */
export interface ReadBackup {
  created: string;
  app: string;
  entries: Partial<Record<BackupLibrary, unknown[]>>;
}

export interface RestoreCount {
  added: number;
  replaced: number;
  refused: number;
}

async function storedLists(): Promise<BackupLists> {
  const [materials, parts, locations, motors, templates] = await Promise.all([
    getMaterialStore().list(),
    getPresetStore().list(),
    getLaunchLocationStore().list(),
    getMotorStore().listCustomMotors(),
    getTemplateStore().list(),
  ]);
  return { materials, parts, locations, motors, templates };
}

export async function libraryCounts(): Promise<Record<BackupLibrary, number>> {
  const lists = await storedLists();
  return {
    materials: lists.materials.length,
    parts: lists.parts.length,
    locations: lists.locations.length,
    motors: lists.motors.length,
    templates: lists.templates.length,
    settings: 1,
  };
}

export async function makeBackup(
  which: ReadonlySet<BackupLibrary>,
  settings: Settings,
  now: Date = new Date(),
): Promise<string> {
  const lists = await storedLists();
  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app: APP_VERSION,
    created: now.toISOString(),
  };
  for (const lib of which) {
    if (lib === 'settings') backup.settings = settings;
    else if (lib === 'materials') backup.materials = lists.materials.map(({ custom: _custom, ...m }) => m);
    else backup[lib] = lists[lib] as never;
  }
  return JSON.stringify(backup, null, 2);
}

export function readBackup(text: string): ReadBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new KeyedError('errors.backup.notBackup');
  }
  const b = data as Record<string, unknown> | null;
  if (!isRecord(b) || b['format'] !== BACKUP_FORMAT) {
    throw new KeyedError('errors.backup.notBackup');
  }
  const version = b['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new KeyedError('errors.backup.notBackup');
  }
  if (version > BACKUP_VERSION)
    throw new KeyedError('errors.backup.newer', { app: typeof b['app'] === 'string' ? b['app'] : '?' });
  const entries: ReadBackup['entries'] = {};
  for (const lib of BACKUP_LIBRARIES) {
    const v = b[lib];
    if (v === undefined) continue;
    if (lib === 'settings') entries.settings = [v];
    else entries[lib] = Array.isArray(v) ? v : [v];
  }
  return {
    created: typeof b['created'] === 'string' ? b['created'] : '',
    app: typeof b['app'] === 'string' ? b['app'] : '',
    entries,
  };
}

// delete then set moves a later duplicate to the end, so the later entry wins.
function usable<T>(raw: unknown[], isItem: (v: unknown) => v is T, idOf: (item: T) => string) {
  const byId = new Map<string, T>();
  let refused = 0;
  for (const v of raw) {
    if (isItem(v)) {
      byId.delete(idOf(v));
      byId.set(idOf(v), v);
    } else refused++;
  }
  return { items: [...byId.values()], refused };
}

const materialKey = (m: Material) => materialId(m.name, m.type);

export async function restoreBackup(
  backup: ReadBackup,
  which: ReadonlySet<BackupLibrary>,
  applySettings: (settings: Settings) => void,
): Promise<Partial<Record<BackupLibrary, RestoreCount>>> {
  const out: Partial<Record<BackupLibrary, RestoreCount>> = {};
  const stored = await storedLists();
  const count = <T>(items: T[], refused: number, isStored: (item: T) => boolean): RestoreCount => {
    const replaced = items.filter(isStored).length;
    return { added: items.length - replaced, replaced, refused };
  };

  for (const lib of BACKUP_LIBRARIES) {
    const raw = backup.entries[lib];
    if (!which.has(lib) || !raw) continue;
    if (lib === 'materials') {
      const { items, refused } = usable(raw, isMaterial, materialKey);
      const ids = new Set(stored.materials.map(materialKey));
      out.materials = count(items, refused, (m) => ids.has(materialKey(m)));
      await addCustomMaterials(items);
    } else if (lib === 'parts') {
      const { items, refused } = usable(
        raw,
        (v): v is CustomPart => isCustomPart(v) && customPartToRow(v) !== null,
        savedPartKey,
      );
      const replaced = await addSavedParts(items);
      out.parts = { added: items.length - replaced, replaced, refused };
    } else if (lib === 'locations') {
      const { items, refused } = usable(raw, isLocation, (p) => p.id);
      const ids = new Set(stored.locations.map((p) => p.id));
      out.locations = count(items, refused, (p) => ids.has(p.id));
      for (const p of items) await getLaunchLocationStore().save(p);
    } else if (lib === 'motors') {
      const { items, refused } = usable(raw, isCustomMotor, (m) => m.id);
      const ids = new Set(stored.motors.map((m) => m.id));
      out.motors = count(items, refused, (m) => ids.has(m.id));
      if (items.length) await getMotorStore().addCustomMotors(items);
    } else if (lib === 'templates') {
      const { items, refused } = usable(raw, isUserTemplate, (t) => t.id);
      const ids = new Set(stored.templates.map((t) => t.id));
      out.templates = count(items, refused, (t) => ids.has(t.id));
      for (const t of items) await getTemplateStore().add(t);
    } else {
      try {
        applySettings(settingsFrom(raw[0]));
        out.settings = { added: 0, replaced: 1, refused: 0 };
      } catch {
        out.settings = { added: 0, replaced: 0, refused: 1 };
      }
    }
  }
  return out;
}
