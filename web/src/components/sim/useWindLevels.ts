import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LaunchConditions, LaunchPatch, WindLevel } from '../../services/design/orkTree';
import { useUnits } from '../../prefs/useUnits';
import { MAX_WIND_SPEED_MS } from '../../services/flight/safetyLimits';
import { retuneStdDev } from '../../services/flight/windTurbulence';
import { parseWindProfileCsv, WindProfileCsvError } from '../../services/flight/windProfileCsv';
import { DEFAULT_HEADING_DEG, duplicateAltitudeRows } from '../../services/flight/windLevels';
import { useLatest } from '../common/useLatest';
import { readFileText } from '../../services/files/decodeText';
import { useFilePick } from '../common/useFilePick';

/** The wind profile's rows: their keys, the edits that keep turbulence in step, and the CSV import. */
export function useWindLevels({
  launch,
  onChange,
  onCommit,
}: {
  launch: LaunchConditions;
  onChange: (patch: LaunchPatch) => void;
  onCommit?: () => void;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const [error, setError] = useState<string | null>(null);
  // Which CSV import is current: a file read outlives this dialog.
  const csvImport = useLatest();

  const levels = launch.windLevels ?? [];
  // Index keys would shift the typed field after a delete; an outside change (undo)
  // shows as a length mismatch and falls back to index keys.
  const [rowIds, setRowIds] = useState<number[]>(() => levels.map((_, i) => i));
  const nextId = () => rowIds.reduce((m, id) => Math.max(m, id), -1) + 1;
  const rowKey = (i: number) => (rowIds.length === levels.length ? `id-${rowIds[i]}` : `i-${i}`);
  // Only the lowest layer carries the pad-wind cap; lowest altitude, since the list is not sorted.
  const surfaceLevel = levels.length
    ? levels.reduce((lowIdx, l, i) => (l.altitudeM < levels[lowIdx]!.altitudeM ? i : lowIdx), 0)
    : -1;
  const windCap = (i: number) => (i === surfaceLevel ? u.toUi('windspeed', MAX_WIND_SPEED_MS) : undefined);
  // Flagged, not prevented: typing 3000 over 300 passes through collisions.
  const dupeRows = new Set(duplicateAltitudeRows(levels));

  const setLevels = (next: WindLevel[]) => onChange({ windLevels: next.length ? next : undefined });
  const replaceLevels = (next: WindLevel[]) => {
    const base = nextId();
    setRowIds(next.map((_, i) => base + i));
    setLevels(next);
  };
  const patchLevel = (i: number, p: Partial<WindLevel>) => {
    if (Object.values(p).some((v) => !Number.isFinite(v))) return;
    setLevels(levels.map((l, j) => (j === i ? { ...l, ...p } : l)));
  };
  const removeLevel = (i: number) => {
    setRowIds(rowIds.filter((_, j) => j !== i));
    setLevels(levels.filter((_, j) => j !== i));
  };
  const addLevel = () => {
    const last = levels[levels.length - 1];
    setRowIds([...rowIds, nextId()]);
    setLevels([
      ...levels,
      {
        // Above the highest level, not the last row: the list is not sorted.
        altitudeM: Math.max(0, ...levels.map((l) => l.altitudeM)) + 300,
        speed: last?.speed ?? 0,
        directionDeg: last?.directionDeg ?? DEFAULT_HEADING_DEG,
        stddev: last?.stddev ?? 0,
      },
    ]);
  };

  // Retuning per keystroke would pass through the "0" of "0.5" and zero the turbulence.
  const [speedEditBase, setSpeedEditBase] = useState<{ row: number; speed: number; stddev: number } | null>(null);
  const setSpeed = (i: number, speed: number) => {
    const l = levels[i]!;
    let base = speedEditBase;
    if (base?.row !== i) {
      base = { row: i, speed: l.speed, stddev: l.stddev };
      setSpeedEditBase(base);
    }
    // As `LevelWindModel.setSpeed`: turbulence keeps its fraction, not its m/s.
    patchLevel(i, { speed, stddev: retuneStdDev(base.speed, base.stddev, speed) });
  };

  const importCsv = async (file: File) => {
    const mine = csvImport.claim();
    try {
      const levels = parseWindProfileCsv(await readFileText(file));
      if (!mine()) return;
      replaceLevels(levels);
      setError(null);
      onCommit?.();
    } catch (e) {
      if (!mine()) return;
      setError(
        e instanceof WindProfileCsvError
          ? t(`windProfile.csv.${e.key}`, { line: e.line })
          : t('windProfile.csv.unreadable'),
      );
    }
  };
  const levelsFile = useFilePick({ accept: '.csv,text/csv', onFile: (f) => void importCsv(f) });

  return {
    levels,
    rowKey,
    windCap,
    dupeRows,
    replaceLevels,
    patchLevel,
    removeLevel,
    addLevel,
    setSpeed,
    setSpeedEditBase,
    error,
    setError,
    levelsFile,
  };
}

export type WindLevels = ReturnType<typeof useWindLevels>;
