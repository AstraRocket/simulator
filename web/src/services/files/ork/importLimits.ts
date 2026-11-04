import { KeyedError } from '../../../i18n/keyedError';
import {
  MAX_FIN_COUNT as KERNEL_MAX_FIN_COUNT,
  MAX_INSTANCE_COUNT,
  MAX_LINE_COUNT as NODE_MAX_LINE_COUNT,
} from '../../../tree/nodeProps';

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
// The byte caps do not bound this (`<bodytube/>` is ~13 bytes).
const MAX_COMPONENTS = 10_000;
export const MAX_LINE_COUNT = NODE_MAX_LINE_COUNT;
export const MAX_SIMULATIONS = 1000;
export const MAX_PASSTHROUGH = 1000;

type ImportFormat = '.ork' | '.rkt';

export function countComponent(ctx: { nodeCount: number }, format: ImportFormat): void {
  if (++ctx.nodeCount > MAX_COMPONENTS) {
    throw new KeyedError('errors.file.tooManyComponents', { format });
  }
}

export function checkDepth(depth: number, format: ImportFormat): void {
  if (depth > MAX_NESTING_DEPTH) {
    throw new KeyedError('errors.file.tooDeep', { format });
  }
}
