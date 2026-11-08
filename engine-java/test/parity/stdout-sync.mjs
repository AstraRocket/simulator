// console.log to a pipe is async on Windows, so process.exit() right after it truncates output.
// Must never block or throw: no callback, timer, promise, or unbounded retry.
import { writeSync } from 'node:fs';

export const TARGET_COMPLETE = '###teavm-target-complete###';

export function writeStdoutSync(text) {
  const buf = Buffer.from(text, 'utf8');
  let written = 0;
  try {
    while (written < buf.length) {
      const n = writeSync(1, buf, written);
      if (n <= 0) break;
      written += n;
    }
  } catch {
    // EAGAIN on a non-blocking fd: the fallback handles the rest.
  }
  if (written >= buf.length) return;

  try {
    process.stdout.write(buf.subarray(written));
  } catch {
    // stdout is gone; the exit code still carries the verdict.
  }
}
