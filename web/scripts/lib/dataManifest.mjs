// A catalog's date is kept while its hash is unchanged, so a no-op run leaves the manifest byte for byte the same.
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

export const catalogHash = (data) => createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 12);

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

export function writeDataManifest(dir, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const out = join(dir, 'manifest.json');
  const prev = readManifest(out);
  const manifest = {};
  const catalogs = {};
  for (const [key, file] of Object.entries(FILES)) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] || fileURLToPath(new URL('../../public/data', import.meta.url));
  console.log('manifest:', writeDataManifest(dir));
}
