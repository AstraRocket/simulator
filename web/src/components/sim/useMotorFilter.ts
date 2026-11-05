import { useMemo, useState } from 'react';
import { loadHideOop, saveHideOop } from './motorPrefs';
import { filterMotors, allClasses, allManufacturers, type CatalogMotor } from '../../services/motors/motorDb';
import { STD_DIAMS, MAX_IDX, fitIdx } from '../../services/motors/motorPicker';
import { usePersistedState } from '../common/usePersistedState';
import { useRemembered, useSlot } from '../tools/remembered';
import { PERF_FIELDS, type PerfField, type PerfRange } from '../../services/motors/motorPerf';
import type { MotorFilterInit } from './MotorFilterBar';

const EMPTY: ReadonlySet<string> = new Set();

export function useMotorFilter(catalog: CatalogMotor[], init: MotorFilterInit = {}, used: ReadonlySet<string> = EMPTY) {
  const slot = useSlot(init.slot);
  const [text, setText] = useRemembered(slot, 'text', '');
  const [hideOop, setHideOop] = usePersistedState(loadHideOop, saveHideOop);
  const [hideUsed, setHideUsed] = useState(false);
  const [cls, setCls] = useRemembered(slot, 'cls', null);
  const [mfrs, setMfrs] = useRemembered(slot, 'mfrs', init.mfrs ?? new Set());
  const [imp, setImp] = useRemembered(slot, 'imp', [null, null]);
  const [perf, setPerfAll] = useRemembered(slot, 'perf', {});
  const [plugged, setPlugged] = useRemembered(slot, 'plugged', false);
  const [sparky, setSparky] = useRemembered(slot, 'sparky', 'any');
  const mount = init.mount ?? null;
  const perfFields = init.perfFields ?? PERF_FIELDS;
  const mountIdx = mount ? fitIdx(mount.bore) : MAX_IDX;
  const [fits, setFits] = useState(mount !== null);
  // Kept apart from the displayed range so the mount's cap is never saved as a preference.
  const startDia = init.dia ?? [0, MAX_IDX];
  const [freeLow, setFreeLow] = useRemembered(slot, 'freeLow', startDia[0]);
  const [freeHigh, setFreeHigh] = useRemembered(slot, 'freeHigh', startDia[1]);
  const [dia, setDiaRaw] = useRemembered(
    slot,
    'dia',
    mount ? [Math.min(startDia[0], mountIdx), Math.min(startDia[1], mountIdx)] : startDia,
  );

  const setFitsAndCeiling = (on: boolean) => {
    setFits(on);
    if (!mount) return;
    setDiaRaw(([low]) => [on ? Math.min(low, mountIdx) : freeLow, on ? Math.min(freeHigh, mountIdx) : freeHigh]);
  };

  // Dragging the ceiling past the mount clears the box, or the drag would change nothing.
  const setDia = (next: [number, number]) => {
    setDiaRaw(next);
    setFreeLow(next[0]);
    setFreeHigh(next[1]);
    if (fits && mount && next[1] > mountIdx) setFits(false);
  };

  const classes = useMemo(() => allClasses(catalog), [catalog]);
  const manufacturers = useMemo(() => allManufacturers(catalog), [catalog]);
  const fit = fits && mount ? mount : undefined;
  const [lowIdx, highIdx] = dia;
  const diaSaved = useMemo(() => [freeLow, freeHigh] as [number, number], [freeLow, freeHigh]);
  const [impMin, impMax] = imp;
  const matches = useMemo(
    () =>
      filterMotors(catalog, {
        text,
        classes: cls ? new Set([cls]) : new Set(),
        manufacturers: mfrs,
        // The extreme stops mean "open end" (no floor / no ceiling).
        minDiameter: lowIdx > 0 ? STD_DIAMS[lowIdx] : undefined,
        maxDiameter: highIdx < MAX_IDX ? STD_DIAMS[highIdx] : undefined,
        minImpulse: impMin ?? undefined,
        maxImpulse: impMax ?? undefined,
        perf,
        perfFields,
        fit,
        plugged,
        sparky,
        hideOop,
        hide: hideUsed ? used : undefined,
      }),
    [
      catalog,
      text,
      cls,
      mfrs,
      lowIdx,
      highIdx,
      impMin,
      impMax,
      perf,
      perfFields,
      fit,
      plugged,
      sparky,
      hideOop,
      hideUsed,
      used,
    ],
  );
  return {
    text,
    setText,
    cls,
    setCls,
    mfrs,
    setMfrs,
    dia,
    setDia,
    diaSaved,
    imp,
    setImp,
    perf,
    perfFields,
    setPerf: (field: PerfField, range: PerfRange) => setPerfAll((cur) => ({ ...cur, [field]: range })),
    clearPerf: () => setPerfAll({}),
    plugged,
    setPlugged,
    sparky,
    setSparky,
    hideOop,
    setHideOop,
    hideUsed,
    setHideUsed,
    fits,
    setFits: setFitsAndCeiling,
    mount,
    classes,
    manufacturers,
    matches,
  };
}
