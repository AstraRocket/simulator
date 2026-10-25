// Writes public/data/manifest.json: a content hash per runtime catalog, used
// by the app to cache-bust a replaced data file (see src/services/app/remoteData.ts).
// The hash fingerprints the data, so it's stable across a later prettier reformat
// of the JSON and changes only when the catalog content changes.
//
// `catalogs` beside the hashes says when each catalog last changed and how many
// rows it holds, which the app shows without downloading the catalog itself.
// The date is carried over from the manifest already in `dir` while the hash is
// unchanged, so a run that changes nothing leaves the manifest byte for byte as
// it was and publishes nothing. An app that predates `catalogs` reads only the
// string values, and skips it.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileAtomic } from './catalogStaging.mjs';

const FILES = {
  motors: 'motors.generated.json',
  components: 'components.generated.json',
  materials: 'materials.generated.json',
  contributors: 'contributors.generated.json',
};

/** A catalog's cache-bust hash: the first 12 hex digits of the SHA-256 of its JSON. */
export const catalogHash = (data) => createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 12);

/** The rows a catalog holds: the array itself, or the one array it wraps. */
export function rowCount(data) {
  if (Array.isArray(data)) return data.length;
  const arrays = Object.values(data ?? {}).filter(Array.isArray);
  return arrays.length === 1 ? arrays[0].length : undefined;
}

function readManifest(path) {
  try {
    const v = JSON.parse(readFileSync(path, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Recompute manifest.json from whatever catalogs are present in `dir`.
 *  `today` is the date stamped on a catalog whose hash changed (UTC, YYYY-MM-DD). */
export function writeDataManifest(dir, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const out = join(dir, 'manifest.json');
  const prev = readManifest(out);
  const manifest = {};
  const catalogs = {};
  for (const [key, file] of Object.entries(FILES)) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    // Hash the parsed→re-serialized data so formatting (compact vs prettier)
    // never changes the token; only a real data change does.
    const data = JSON.parse(readFileSync(path, 'utf8'));
    const hash = catalogHash(data);
    manifest[key] = hash;
    const kept = prev[key] === hash ? prev.catalogs?.[key]?.updated : undefined;
    const count = rowCount(data);
    catalogs[key] = {
      updated: typeof kept === 'string' ? kept : today,
      ...(count === undefined ? {} : { count }),
    };
  }
  manifest.catalogs = catalogs;
  writeFileAtomic(out, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

// Runnable directly: `node scripts/lib/dataManifest.mjs [publicDataDir]`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] || fileURLToPath(new URL('../../public/data', import.meta.url));
  console.log('manifest:', writeDataManifest(dir));
}
