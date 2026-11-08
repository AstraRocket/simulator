import { useEffect, useMemo, useState } from 'react';
import type { AeroSweep, OpenRocketDesign } from '../../engine/openRocketEngine';

// `aeroSweep` is a slow synchronous kernel call, so it runs one macrotask after render to let `pending` paint.

export interface AeroSweepInputs {
  machMax: number;
  aoaDeg: number;
  thetaDeg: number;
  rollRate: number;
  altitudeM: number;
}

type SweepSource = Pick<OpenRocketDesign, 'aeroSweep'>;

type Run = AeroSweepInputs & { rocket: SweepSource | null };

const SWEEP_DEFER_MS = 0;

export function useAeroSweep(
  rocket: SweepSource | null,
  { machMax, aoaDeg, thetaDeg, rollRate, altitudeM }: AeroSweepInputs,
): { sweep: AeroSweep | null; pending: boolean } {
  // `pending` is derived, not a flag: setting one in the effect is a cascading render the compiler lint rejects.
  const run = useMemo<Run>(
    () => ({ rocket, machMax, aoaDeg, thetaDeg, rollRate, altitudeM }),
    [rocket, machMax, aoaDeg, thetaDeg, rollRate, altitudeM],
  );
  const [done, setDone] = useState<{ sweep: AeroSweep | null; run: Run | null }>({ sweep: null, run: null });

  useEffect(() => {
    let canceled = false;
    const id = setTimeout(() => {
      if (canceled) return;
      let next: AeroSweep | null = null;
      if (run.rocket) {
        try {
          const machStep = run.machMax <= 1 ? 0.02 : run.machMax > 3 ? 0.1 : 0.05;
          next = run.rocket.aeroSweep({
            machMin: 0.05,
            machMax: run.machMax,
            machStep,
            aoaDeg: run.aoaDeg,
            thetaDeg: run.thetaDeg,
            rollRate: run.rollRate,
            ...(run.altitudeM !== 0
              ? { machAlt: [[0, run.altitudeM] as [number, number], [run.machMax, run.altitudeM] as [number, number]] }
              : {}),
          });
        } catch (e) {
          console.error('aeroSweep failed', e);
        }
      }
      if (!canceled) setDone({ sweep: next, run });
    }, SWEEP_DEFER_MS);
    return () => {
      canceled = true;
      clearTimeout(id);
    };
  }, [run]);

  return { sweep: rocket ? done.sweep : null, pending: !!rocket && done.run !== run };
}
