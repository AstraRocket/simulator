// A digest is right only for the build it was computed with, so every jar is checked against the pinned SHA-256.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PIN = JSON.parse(readFileSync(new URL('../data/openrocket-release.json', import.meta.url), 'utf8'));

export const RELEASE = PIN.release;

export const DATABASE = { url: PIN.database.url, ref: PIN.database.ref };

export const UNPINNED = process.env.OPENROCKET_UNPINNED === '1';

export function checkJar(jar) {
  const sha = createHash('sha256').update(readFileSync(jar)).digest('hex');
  if (sha === PIN.jar.sha256) return;
  const msg = `${jar} is not the OpenRocket ${RELEASE} release jar (SHA-256 ${sha}, expected ${PIN.jar.sha256}).`;
  if (UNPINNED) {
    console.warn(`${msg}\nOPENROCKET_UNPINNED=1: using it anyway. Do not commit or publish what this run writes.`);
    return;
  }
  console.error(`${msg}\nPass --jar <OpenRocket-${RELEASE}.jar>, from ${PIN.jar.url}.`);
  process.exit(2);
}

export function checkSourceTree(dir) {
  const msg = `${dir} is a source tree, not the OpenRocket ${RELEASE} release jar, so its digests are not the release's.`;
  if (UNPINNED) {
    console.warn(`${msg}
OPENROCKET_UNPINNED=1: using it anyway. Do not commit or publish what this run writes.`);
    return;
  }
  console.error(
    `${msg}
Pass --jar <OpenRocket-${RELEASE}.jar>, from ${PIN.jar.url}, or set OPENROCKET_UNPINNED=1 to try it anyway.`,
  );
  process.exit(2);
}
