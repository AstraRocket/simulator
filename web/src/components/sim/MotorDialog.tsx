import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_IDX, type MountFit } from '../../services/motors/motorPicker';
import type { MotorSpec } from '../../engine/openRocketEngine';
import { Dialog } from '../common/Dialog';
import { keyOf } from '../../services/motors/motorKey';
import { useCatalog } from './useCatalog';
import { useMotorFilter } from './useMotorFilter';
import { loadDia, loadMfrs, saveDia, saveMfrs } from './motorPrefs';
import { useLiftoffFields, type LiftoffAt } from './useLiftoffFields';
import { useCatalogInfo } from './useCatalogInfo';
import { MotorFilters, MotorList, SelectedMotor } from './MotorDialogParts';
import { useCatalogEdits, useMotorChoice } from './useMotorChoice';
import { findSeated } from '../../services/motors/seatedMotor';

export function MotorDialog({
  onClose,
  onSelect,
  onError,
  mount,
  current,
  used = [],
  liftoff,
}: {
  onClose: () => void;
  onSelect: (m: MotorSpec) => void;
  onError: (msg: string | null) => void;
  /** Bore and room in mm. */
  mount?: MountFit | null;
  current?: MotorSpec | null;
  used?: MotorSpec[];
  liftoff?: LiftoffAt | null;
}) {
  const { t } = useTranslation();
  const choice = useMotorChoice({ onSelect, onClose, onError });
  const { setDelay, selected, setSelected, setCurveIdx } = choice;

  const updated = useCatalogInfo()?.updated;
  // Restores the seated motor when the catalog lands, before any click can conflict.
  const { catalog, setCatalog, loading, error, retry } = useCatalog({
    onLoaded: (c) => {
      const m = current && findSeated(c, current);
      if (!m) return;
      setSelected(m);
      setDelay(current.ejectionDelay);
      const ci = m.curves?.findIndex((cv) => cv.src === current.curveSrc) ?? -1;
      setCurveIdx(ci >= 0 ? ci : 0);
    },
  });
  const usedKeys = useMemo(
    () =>
      new Set(
        used.flatMap((spec) => {
          const m = findSeated(catalog, spec);
          return m ? [keyOf(m)] : [];
        }),
      ),
    [used, catalog],
  );
  // Never defaulted from the mount, or it would follow the user to a larger mount.
  const liftoffFields = useLiftoffFields(liftoff);
  const [filterInit] = useState(() => ({
    mfrs: loadMfrs(),
    dia: loadDia() ?? ([0, MAX_IDX] as [number, number]),
    mount: mount && mount.bore > 0 ? mount : null,
  }));
  const filter = useMotorFilter(catalog, { ...filterInit, perfFields: liftoffFields }, usedKeys);
  const { mfrs, diaSaved, matches, fits } = filter;

  useEffect(() => {
    saveMfrs(mfrs);
  }, [mfrs]);
  // `diaSaved`, not the displayed range, which shows the mount's ceiling while fit is ticked.
  useEffect(() => {
    saveDia(diaSaved);
  }, [diaSaved]);

  const { note, motorFile, onDelete } = useCatalogEdits(setCatalog, onError);

  // Derived, not cleared: Select must not apply a hidden motor, but the highlight returns with the row.
  const selectedKey = selected ? keyOf(selected) : null;
  const shown = selected && matches.some((m) => keyOf(m) === selectedKey) ? selected : null;

  return (
    <Dialog
      id="motorPicker"
      fullBleed="xl"
      title={t('motorDlg.title')}
      onClose={onClose}
      size="6xl"
      layout="fill"
      height={800}
    >
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div
          className={`flex min-h-0 flex-col md:w-[440px] md:shrink-0 md:border-r md:border-line/10 ${shown ? 'hidden md:flex' : 'flex'}`}
        >
          <MotorFilters filter={filter} motorFile={motorFile} hasUsed={usedKeys.size > 0} />

          <MotorList
            error={error}
            retry={retry}
            loading={loading}
            matches={matches}
            fits={fits}
            choice={choice}
            selectedKey={selectedKey}
            onDelete={onDelete}
          />

          <div className="border-t border-line/10 p-2 text-center text-[11px] uppercase tracking-wide text-ink-faint">
            {loading ? '' : (note ?? t('motor.count', { total: matches.length }))}
            {!loading && updated && (
              <div className="normal-case tracking-normal">{t('catalog.updatedOn', { date: updated })}</div>
            )}
          </div>
        </div>

        <div className={`min-h-0 min-w-0 flex-1 flex-col ${shown ? 'flex' : 'hidden md:flex'}`}>
          {shown ? (
            <SelectedMotor shown={shown} choice={choice} />
          ) : (
            <div className="grid flex-1 place-items-center p-6 text-center text-sm text-ink-faint">
              {t('motorDlg.pickHint')}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
