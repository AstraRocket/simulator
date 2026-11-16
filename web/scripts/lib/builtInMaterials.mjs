import { fileURLToPath } from 'node:url';
import { runDumper } from './openrocketJava.mjs';

const key = (type, name) => `${type}\u0000${name.toLowerCase()}`;

// Read from the build's own `Databases`, not the catalog, so a part weighs what that build's desktop gives it.
export function builtInMaterials(cp) {
  const rows = runDumper({
    cp,
    javaSrc: fileURLToPath(new URL('../preset-digests/MaterialDump.java', import.meta.url)),
    className: 'MaterialDump',
  });
  const density = new Map(rows.map(([type, name, d]) => [key(type, name), Number(d)]));
  return (type, name) => density.get(key(type, name));
}
