import type { KeyValueStore } from './keyValueStore';
import { IndexedDbKeyValueStore } from './idbKeyValueStore';
import { JsonListStore } from './jsonListStore';
import { uuid } from '../app/uuid';
import { nsKey } from './storageKeys';

export interface LaunchLocation {
  id: string;
  name: string;
  latitudeDeg: number;
  longitudeDeg: number;
  /** Null when unknown: assuming sea level would fly a high field's thin air as sea-level air. */
  launchAltitudeM: number | null;
}

export interface LaunchLocationStore {
  list(): Promise<LaunchLocation[]>;
  save(location: LaunchLocation): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Says `pads` because existing browsers store locations under it; renaming would orphan them. */
const LOCATIONS_KEY = nsKey('pads:custom');

// The launch fields clamp to these too, so a location saved from the fields always reads back.
export const LAUNCH_SITE_LIMITS = {
  latitudeDeg: { min: -90, max: 90 },
  longitudeDeg: { min: -180, max: 180 },
  launchAltitudeM: { min: -500, max: 10000 },
  temperatureC: { min: -90, max: 70 },
} as const;

export function isLocation(v: unknown): v is LaunchLocation {
  const p = v as LaunchLocation;
  const num = (x: unknown, { min, max }: { min: number; max: number }): boolean =>
    typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
  return (
    !!p &&
    typeof p.id === 'string' &&
    p.id !== '' &&
    typeof p.name === 'string' &&
    num(p.latitudeDeg, LAUNCH_SITE_LIMITS.latitudeDeg) &&
    num(p.longitudeDeg, LAUNCH_SITE_LIMITS.longitudeDeg) &&
    (p.launchAltitudeM === null || num(p.launchAltitudeM, LAUNCH_SITE_LIMITS.launchAltitudeM))
  );
}

export class KeyValueLaunchLocationStore implements LaunchLocationStore {
  private readonly items: JsonListStore<LaunchLocation>;

  constructor(key: string = LOCATIONS_KEY, kv: KeyValueStore = new IndexedDbKeyValueStore()) {
    this.items = new JsonListStore(key, isLocation, (p) => p.id, kv);
  }

  list(): Promise<LaunchLocation[]> {
    return this.items.list();
  }

  async save(location: LaunchLocation): Promise<void> {
    if (!isLocation(location)) throw new Error('invalid-location');
    await this.items.upsert([location]);
  }

  remove(id: string): Promise<void> {
    return this.items.remove(id);
  }
}

let store: LaunchLocationStore = new KeyValueLaunchLocationStore();

export function getLaunchLocationStore(): LaunchLocationStore {
  return store;
}

export function setLaunchLocationStore(next: LaunchLocationStore): void {
  store = next;
}

export function locationFrom(
  name: string,
  site: { latitudeDeg: number | null; longitudeDeg: number | null; launchAltitudeM: number | null },
): LaunchLocation {
  return {
    id: uuid(),
    name: name.trim(),
    // Unreachable zeroes: save is disabled while either coordinate is blank.
    latitudeDeg: site.latitudeDeg ?? 0,
    longitudeDeg: site.longitudeDeg ?? 0,
    launchAltitudeM: site.launchAltitudeM,
  };
}

/** Always all three: keeping the previous site's elevation would fly the wrong air. */
export function siteOf<T extends Pick<LaunchLocation, 'latitudeDeg' | 'longitudeDeg'> & { launchAltitudeM: unknown }>(
  x: T,
): Pick<T, 'latitudeDeg' | 'longitudeDeg' | 'launchAltitudeM'> {
  return { latitudeDeg: x.latitudeDeg, longitudeDeg: x.longitudeDeg, launchAltitudeM: x.launchAltitudeM };
}
