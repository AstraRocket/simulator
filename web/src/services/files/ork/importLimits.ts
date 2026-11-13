import type { ComponentNode } from '../../../engine/openRocketEngine';
import { KeyedError } from '../../../i18n/keyedError';
import { clusterCount } from '../../../tree/cluster';
import {
  countOf,
  MAX_FIN_COUNT as KERNEL_MAX_FIN_COUNT,
  MAX_INSTANCE_COUNT,
  MAX_LINE_COUNT as NODE_MAX_LINE_COUNT,
} from '../../../tree/nodeProps';
import { KERNEL_DEFAULTS } from '../../../tree/kernelDefaults';

// Ceilings for an untrusted .ork: a crafted file gets a clear error, not a frozen tab.

export const MAX_ARCHIVE_ENTRIES = 256;
// Each gzip member costs a fresh inflater, so millions of tiny ones take minutes under every byte cap.
export const MAX_GZIP_MEMBERS = 4;
export const MAX_ARCHIVE_ENTRY_BYTES = 64 * 1024 * 1024; // 64 MiB uncompressed per member
export const MAX_ARCHIVE_TOTAL_BYTES = 128 * 1024 * 1024; // 128 MiB uncompressed total
// JsonLite.MAX_DEPTH 64 allows 30 levels, walked at depth L - 1; engineBoundary.test.ts pins it.
export const MAX_NESTING_DEPTH = 29;
export const MAX_MOTOR_CONFIGS = 256;
export const MAX_FIN_COUNT = KERNEL_MAX_FIN_COUNT;
export const MAX_ASSEMBLY_INSTANCES = MAX_INSTANCE_COUNT;
export const MAX_FIN_POINTS = 10_000;
// The bridge's ComponentFactory holds these three. The byte caps do not bound the part count
// (`<bodytube/>` is ~13 bytes), and the kernel's build grows with its square; real designs have about 50.
export const MAX_COMPONENTS = 1000;
// Each count is capped alone, but nesting multiplies them: three pod sets of 64 are 262,144 parts.
export const MAX_TOTAL_INSTANCES = 20_000;
// Each automatic radius walks back to a sized part, so a long run costs its length squared; real runs are a few.
export const MAX_AUTO_RADIUS_RUN = 16;
export const MAX_LINE_COUNT = NODE_MAX_LINE_COUNT;
export const MAX_SIMULATIONS = 1000;
export const MAX_PASSTHROUGH = 1000;

type ImportFormat = '.ork' | '.rkt';

export function countComponent(ctx: { nodeCount: number }, format: ImportFormat): void {
  if (++ctx.nodeCount > MAX_COMPONENTS) {
    throw new KeyedError('errors.file.tooManyComponents', { format });
  }
}

// How many copies the kernel places of this node, and so of everything inside it (ComponentFactory.instancesOf).
function instancesOf(n: ComponentNode): number {
  switch (n.type) {
    case 'podset':
    case 'parallelstage':
      return countOf(n, 'instanceCount', KERNEL_DEFAULTS[n.type].instanceCount);
    case 'launchlug':
    case 'railbutton':
    case 'centeringring':
    case 'bulkhead':
    case 'engineblock':
      return countOf(n, 'instanceCount', 1);
    case 'trapezoidfinset':
    case 'ellipticalfinset':
    case 'freeformfinset':
      return countOf(n, 'finCount', 3);
    case 'tubefinset':
      return countOf(n, 'finCount', 6);
    case 'innertube':
      return clusterCount(n['cluster'] as string | undefined);
    default:
      return 1;
  }
}

// Null for a part with no radius of its own to size (ComponentFactory.autoRadiusOf).
function autoRadiusOf(n: ComponentNode): boolean | null {
  switch (n.type) {
    case 'nosecone':
      return n['aftRadiusAuto'] === true;
    case 'bodytube':
      return n['outerRadiusAuto'] === true;
    case 'transition':
      return (
        n['foreRadiusAuto'] === true ||
        n['aftRadiusAuto'] === true ||
        typeof n['foreRadius'] !== 'number' ||
        typeof n['aftRadius'] !== 'number'
      );
    default:
      return null;
  }
}

// Before the build: a crafted file would stall it.
export function checkBuildSize(components: readonly ComponentNode[], format: ImportFormat): void {
  let total = 0;
  let autoRun = 0;
  const walk = (nodes: readonly ComponentNode[], copies: number): void => {
    for (const n of nodes) {
      const here = copies * instancesOf(n);
      total += here;
      if (total > MAX_TOTAL_INSTANCES) throw new KeyedError('errors.file.tooManyInstances', { format });
      const auto = autoRadiusOf(n);
      if (auto !== null) autoRun = auto ? autoRun + 1 : 0;
      if (autoRun > MAX_AUTO_RADIUS_RUN) throw new KeyedError('errors.file.autoRadiusRunTooLong', { format });
      if (n.children) walk(n.children, here);
    }
  };
  walk(components, 1);
}

export function checkDepth(depth: number, format: ImportFormat): void {
  if (depth > MAX_NESTING_DEPTH) {
    throw new KeyedError('errors.file.tooDeep', { format });
  }
}
