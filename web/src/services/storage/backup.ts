// A backup of everything the user keeps in this browser besides designs: one
// JSON file to move to another browser or machine, or to keep.
//
// Designs are not in it: each one already saves as an `.ork`. Nor are the API
// keys for third-party services (userKey.ts), which are the user's credentials
// and do not belong in a file that gets passed around.
//
// Every entry read back goes through the same guard its store applies to what
// it reads, so a hand-edited or damaged file costs the entries that are wrong,
// counted as refused, and nothing else.
import { APP_VERSION } from '../app/appInfo';
import { KeyedError } from '../../i18n/keyedError';
import { isMaterial, getMaterialStore } from '../materials/materialStore';
import { addCustomMaterials } from '../materials/materials';
import type { Material } from '../materials/materialTypes';
import { getPresetStore, isCustomPart, type CustomPart } from '../parts/presetStore';
import { addSavedParts, customPartToRow } from '../parts/customParts';
import { getLaunchLocationStore, isLocation, type LaunchLocation } from './launchLocationStore';
import { getMotorStore, isCustomMotor, type CustomMotor } from '../motors/motorStore';
import { getTemplateStore, isUserTemplate, type UserTemplate } from '../exports/templateStore';
import { settingsFrom, type Settings } from './settings';

/** What the file says it is, so another JSON file is refused rather than half-read. */
const BACKUP_FORMAT = 'astrarocket-backup';
/** The layout version. A file from a newer layout is refused, not guessed at. */
const BACKUP_VERSION = 1;

/** Every library a backup can hold, in the order the dialog lists them. */
export const BACKUP_LIBRARIES = ['materials', 'parts', 'locations', 'motors', 'templates', 'settings'] as const;
export type BackupLibrary = (typeof BACKUP_LIBRARIES)[number];

interface BackupLists {
  materials: Material[];
  parts: CustomPart[];
  locations: LaunchLocation[];
  motors: CustomMotor[];
  templates: UserTemplate[];
}

/** A backup file's contents. A library left out of the backup is absent. */
export type Backup = Partial<BackupLists> & {
  format: typeof BACKUP_FORMAT;
  version: number;
  app: string;
  created: string;
  settings?: Settings;
};

/** A backup file as read: each library present, as the raw entries the file holds. */
export interface ReadBackup {
  created: string;
  app: string;
  entries: Partial<Record<BackupLibrary, unknown[]>>;
}

/** What a restore did to one library. */
export interface RestoreCount {
  added: number;
  replaced: number;
  refused: number;
}

/** The stored lists, read once for both the counts and the backup. */
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

/** How many entries each library holds now; the settings count as one. */
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

/** The backup file's text for the chosen libraries. */
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
    // The `custom` flag is how the store marks what it reads back, not part of the material.
    else if (lib === 'materials') backup.materials = lists.materials.map(({ custom: _custom, ...m }) => m);
    else backup[lib] = lists[lib] as never;
  }
  return JSON.stringify(backup, null, 2);
}

/**
 * Read a backup file's text. Throws a keyed error for text that is not a
 * backup of this app, or one from a newer layout than this build reads.
 */
export function readBackup(text: string): ReadBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new KeyedError('errors.backup.notBackup');
  }
  const b = data as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b) || b['format'] !== BACKUP_FORMAT) {
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

/** The usable entries of a list, and how many were not. Later entries win over earlier ones of the same identity. */
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

const materialId = (m: Material) => JSON.stringify([m.type, m.name]);

/**
 * Merge the chosen libraries of a backup into this browser.
 *
 * Lists are merged: an entry with the identity of a stored one replaces it (a
 * material by type and name, a saved part by type, maker and part number,
 * anything else by its id) and the rest are added. The settings are replaced
 * as a whole, through `applySettings`, which is the settings provider's own
 * write so the open app follows them at once.
 */
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
      const { items, refused } = usable(raw, isMaterial, materialId);
      const ids = new Set(stored.materials.map(materialId));
      out.materials = count(items, refused, (m) => ids.has(materialId(m)));
      await addCustomMaterials(items);
    } else if (lib === 'parts') {
      // A part the picker could not list is refused, as saving one is.
      const { items, refused } = usable(
        raw,
        (v): v is CustomPart => isCustomPart(v) && customPartToRow(v) !== null,
        (p) => JSON.stringify([p.type, p.mfr, p.partNo]),
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
