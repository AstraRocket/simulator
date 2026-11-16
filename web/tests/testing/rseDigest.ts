import { parseRseWithDigests } from '../../src/services/motors/rseParser';

/** The digest desktop names a one-motor `.rse` by. */
export const rseDigest = (text: string): string | null => {
  const motors = parseRseWithDigests(text);
  return motors.length === 1 ? motors[0]!.digest : null;
};
