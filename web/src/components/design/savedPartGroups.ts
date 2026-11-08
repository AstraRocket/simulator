import type { ComponentType } from '../../services/parts/componentDb';
import type { SavedPartEntry } from '../../services/parts/customParts';
import { groupBy } from '../../services/app/collections';

// Typed against the catalog's type list so a new catalog type does not compile until it has a place.
const GROUP_ORDER = {
  nosecone: 0,
  bodytube: 1,
  transition: 2,
  tubecoupler: 3,
  centeringring: 4,
  bulkhead: 5,
  engineblock: 6,
  parachute: 7,
  streamer: 8,
  launchlug: 9,
  railbutton: 10,
} as const satisfies Record<ComponentType, number>;

const rank = (type: string): number =>
  // A type the app no longer knows sorts last rather than first.
  (GROUP_ORDER as Record<string, number>)[type] ?? Object.keys(GROUP_ORDER).length;

export function groupSavedParts(entries: readonly SavedPartEntry[]): { type: string; list: SavedPartEntry[] }[] {
  return [...groupBy(entries, (e) => e.part.type).entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([type, list]) => ({
      type,
      list: [...list].sort((a, b) => a.part.partNo.localeCompare(b.part.partNo)),
    }));
}
