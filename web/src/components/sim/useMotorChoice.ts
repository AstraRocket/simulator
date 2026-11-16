import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLatest } from '../common/useLatest';
import { hasLocalCurve, importCustomMotors, deleteCustomMotor, type CatalogMotor } from '../../services/motors/motorDb';
import { catalogMotorSpec } from '../../services/motors/motorSpec';
import { parseDelays } from '../../services/motors/motorPicker';
import { PLUGGED_DELAY, type MotorSpec } from '../../engine/openRocketEngine';
import { keyOf } from '../../services/motors/motorKey';
import { errorText } from '../../i18n/keyedError';
import { fmtList } from '../../i18n/format';
import { useFilePick } from '../common/useFilePick';
import { confirmDelete } from '../../state/confirmStore';

const DEFAULT_DELAY = 3;

export function useMotorChoice({
  onSelect,
  onClose,
  onError,
}: {
  onSelect: (m: MotorSpec) => void;
  onClose: () => void;
  onError: (msg: string | null) => void;
}) {
  const { t } = useTranslation();
  const [delay, setDelay] = useState(DEFAULT_DELAY);
  const [selected, setSelected] = useState<CatalogMotor | null>(null);
  const [curveIdx, setCurveIdx] = useState(0);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const pickWrite = useLatest();

  // In the handler, not an effect, so the seeded values above are never stomped.
  const choose = (m: CatalogMotor) => {
    setSelected(m);
    setCurveIdx(0);
    const { delays, plugged } = parseDelays(m.delays);
    if (delays.length) setDelay(delays[Math.floor(delays.length / 2)]!);
    else if (plugged) setDelay(PLUGGED_DELAY);
    else setDelay(DEFAULT_DELAY);
  };

  const pick = async (m: CatalogMotor, curveIndex = 0) => {
    if (!hasLocalCurve(m)) return;
    const mine = pickWrite.claim();
    setLoadingKey(keyOf(m));
    onError(null);
    try {
      const spec = await catalogMotorSpec(m, delay, curveIndex);
      if (!mine()) return;
      onSelect(spec);
      onClose();
    } catch (e) {
      if (!mine()) return;
      onError(errorText(e, t));
    } finally {
      if (mine()) setLoadingKey(null);
    }
  };

  return { delay, setDelay, selected, setSelected, curveIdx, setCurveIdx, loadingKey, choose, pick };
}

export type MotorChoice = ReturnType<typeof useMotorChoice>;

export function useCatalogEdits(setCatalog: (catalog: CatalogMotor[]) => void, onError: (msg: string | null) => void) {
  const { t } = useTranslation();
  const [note, setNote] = useState<string | null>(null);
  // Separate from `pickWrite`, so an import and a pick do not cancel each other.
  const catalogWrite = useLatest();

  const onImport = async (files: File[]) => {
    onError(null);
    setNote(null);
    const mine = catalogWrite.claim();
    try {
      const { catalog, imported, failed } = await importCustomMotors(files.map((f) => ({ name: f.name, blob: f })));
      if (!mine()) return;
      setCatalog(catalog);
      const done = t('motor.importedN', { count: imported });
      setNote(failed.length ? `${done} ${t('motor.importSkipped', { files: fmtList(failed) })}` : done);
    } catch (err) {
      if (!mine()) return;
      onError(errorText(err, t));
    }
  };
  const motorFile = useFilePick({ accept: '.eng,.ENG,.rse,.RSE', onFiles: (f) => void onImport(f) });

  const onDelete = async (m: CatalogMotor) => {
    if (!m.id) return;
    const ok = await confirmDelete(t('motor.deleteConfirm', { name: m.designation }));
    if (!ok) return;
    onError(null);
    const mine = catalogWrite.claim();
    try {
      const catalog = await deleteCustomMotor(m.id);
      if (!mine()) return;
      setCatalog(catalog);
    } catch (err) {
      if (!mine()) return;
      onError(errorText(err, t));
    }
  };

  return { note, motorFile, onDelete };
}
