import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogMotor } from '../../services/motors/motorDb';
import { Dialog } from '../common/Dialog';
import { MotorDetail } from './MotorDetail';
import { keyOf } from '../../services/motors/motorKey';
import { useCatalog } from './useCatalog';
import {
  ClassChips,
  DiameterRange,
  ImpulseRange,
  PerfFilters,
  ManufacturerMenu,
  PluggedFilter,
  SparkyFilter,
  OopFilter,
  type MotorFilterHeld,
} from './MotorFilterBar';
import { useMotorFilter } from './useMotorFilter';
import { useVisibleColumns } from './motorColumns';
import { useMotorSort, type MotorSortHeld } from './useMotorSort';
import { ColumnChooser, MotorGrid } from './MotorGrid';
import { MotorComparePane } from './MotorComparePane';
import { MotorCombinePane } from './MotorCombinePane';
import { ExhaustStylesPane } from './ExhaustStylesPane';
import { ToggleButton } from '../common/ToggleButton';
import { fmtNum } from '../../i18n/format';
import { toggledEntry } from '../../services/app/collections';
import { MotorSearch } from './MotorPanelParts';
import { useCatalogInfo } from './useCatalogInfo';
import { useRemembered, useSlot, type RememberedSlot } from '../tools/remembered';

type Mode = 'detail' | 'combine' | 'compare' | 'exhaust';

interface MotorDashboardHeld {
  selected: CatalogMotor | null;
  curveIdx: number;
  checked: Map<string, CatalogMotor>;
  mode: Mode;
}

export interface MotorDashboardSlots {
  filter: RememberedSlot<MotorFilterHeld>;
  sort: RememberedSlot<MotorSortHeld>;
  view: RememberedSlot<MotorDashboardHeld>;
}

function PaneBar({ mode, checkedCount, onMode }: { mode: Mode; checkedCount: number; onMode: (mode: Mode) => void }) {
  const { t } = useTranslation();
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line/10 bg-surface px-3 py-2">
      <button
        onClick={() => onMode('detail')}
        className="rounded-lg bg-raised px-3 py-1 text-xs font-medium text-ink hover:bg-elevated"
      >
        <span aria-hidden="true">←</span> {t('dash.back')}
      </button>
      {mode !== 'exhaust' && (
        <>
          <ToggleButton
            active={mode === 'compare'}
            disabled={checkedCount < 2}
            onClick={() => onMode('compare')}
            className="w-24 rounded-lg px-3 py-1 text-center text-xs font-medium ring-1 ring-line/10"
          >
            {t('dash.compareN', { n: checkedCount })}
          </ToggleButton>
          <ToggleButton
            active={mode === 'combine'}
            disabled={checkedCount < 2}
            onClick={() => onMode('combine')}
            className="w-24 rounded-lg px-3 py-1 text-center text-xs font-medium ring-1 ring-line/10"
          >
            {t('dash.combine', { n: checkedCount })}
          </ToggleButton>
        </>
      )}
    </div>
  );
}

/** `frame` places the title-bar actions and the panes: a dialog, or the Tools tab. */
export function MotorDashboardView({
  slots,
  frame,
}: {
  slots?: MotorDashboardSlots;
  frame: (actions: ReactNode, panes: ReactNode) => ReactNode;
}) {
  const { t } = useTranslation();
  const catalogMeta = useCatalogInfo();
  const view = useSlot(slots?.view);
  const [selected, setSelected] = useRemembered(view, 'selected', null);
  const [curveIdx, setCurveIdx] = useRemembered(view, 'curveIdx', 0);
  const [checked, setChecked] = useRemembered(view, 'checked', new Map());
  const [mode, setMode] = useRemembered(view, 'mode', 'detail');

  const { catalog, loading: catalogLoading, error: catalogError, retry } = useCatalog();
  const { visCols, cols, toggleCol } = useVisibleColumns();

  const {
    text,
    setText,
    cls,
    setCls,
    mfrs,
    setMfrs,
    dia,
    setDia,
    imp,
    setImp,
    perf,
    perfFields,
    setPerf,
    clearPerf,
    plugged,
    setPlugged,
    sparky,
    setSparky,
    classes,
    manufacturers,
    matches: filtered,
    hideOop,
    setHideOop,
  } = useMotorFilter(catalog, { slot: slots?.filter });

  const { sort, shown, clickHeader } = useMotorSort(filtered, slots?.sort);

  // Curve index reset here, not in an effect, which would render once with the old curve index.
  const select = (m: CatalogMotor | null) => {
    setSelected(m);
    setCurveIdx(0);
    setMode('detail');
  };

  // Stable for the combine pane's memo.
  const checkedMotors = useMemo(() => [...checked.values()], [checked]);
  const effMode: Mode =
    mode === 'exhaust' || ((mode === 'combine' || mode === 'compare') && checked.size >= 2) ? mode : 'detail';

  const toggleCheck = (m: CatalogMotor) => setChecked((prev) => toggledEntry(prev, keyOf(m), m));

  return frame(
    <>
      {catalogMeta?.count !== undefined && (
        <span className="hidden text-xs text-ink-muted sm:inline">
          {t('catalog.motorsInfo', { count: fmtNum(catalogMeta.count), date: catalogMeta.updated })}
        </span>
      )}
      {checked.size > 0 && (
        <>
          <span className="text-xs text-ink-muted">{t('dash.selectedN', { n: checked.size })}</span>
          <button
            onClick={() => {
              setChecked(new Map());
              setMode('detail');
            }}
            className="rounded-lg bg-raised px-2 py-1 text-xs text-ink-soft hover:bg-elevated"
          >
            {t('dash.clear')}
          </button>
        </>
      )}
      <ToggleButton
        active={effMode === 'exhaust'}
        onClick={() => setMode(effMode === 'exhaust' ? 'detail' : 'exhaust')}
        className="rounded-lg px-2 py-1 text-xs"
      >
        {t('exhaust.title')}
      </ToggleButton>
    </>,
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {/* min-w-0 lets the grid scroll internally instead of pushing the detail pane. */}
      <div
        className={`${effMode === 'detail' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col md:border-r md:border-line/10`}
      >
        <div className="flex flex-wrap items-center gap-2 p-3">
          {/* On the Tools tab focus stays on the tab list, and a phone keeps its keyboard down. */}
          <MotorSearch value={text} onChange={setText} autoFocus={!slots} className="min-w-[140px] py-1.5" />
          <ManufacturerMenu manufacturers={manufacturers} mfrs={mfrs} onChange={setMfrs} align="right" />
          <ColumnChooser visCols={visCols} onToggle={toggleCol} />
          <DiameterRange dia={dia} onChange={setDia} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2">
          <ClassChips classes={classes} cls={cls} onChange={setCls} />
          <ImpulseRange imp={imp} onChange={setImp} />
          <PluggedFilter plugged={plugged} onChange={setPlugged} />
          <SparkyFilter value={sparky} onChange={setSparky} />
          <OopFilter on={hideOop} onChange={setHideOop} />
        </div>
        <div className="px-3 pb-2">
          <PerfFilters perf={perf} onChange={setPerf} onClear={clearPerf} fields={perfFields} />
        </div>

        <MotorGrid
          // Hidden, not unmounted: its window arrow-key listener must be told.
          active={effMode === 'detail'}
          shown={shown}
          cols={cols}
          sort={sort}
          onSort={clickHeader}
          selected={selected}
          onSelect={select}
          checked={checked}
          onToggleCheck={toggleCheck}
          catalogLoading={catalogLoading}
          catalogError={catalogError}
          onRetry={retry}
        />
      </div>

      <div
        className={`min-h-0 overflow-y-auto ${effMode === 'detail' ? 'w-full max-md:max-h-[40%] md:w-[440px] md:shrink-0' : 'w-full flex-1'}`}
      >
        {effMode !== 'detail' && <PaneBar mode={effMode} checkedCount={checked.size} onMode={setMode} />}
        {effMode === 'exhaust' ? (
          <ExhaustStylesPane />
        ) : effMode === 'compare' ? (
          <MotorComparePane motors={checkedMotors} cols={cols} />
        ) : effMode === 'combine' ? (
          <MotorCombinePane motors={checkedMotors} />
        ) : checked.size >= 2 ? (
          <div className="p-6">
            <div className="mx-auto max-w-xs space-y-4 text-center">
              <div className="text-xs uppercase tracking-wide text-ink-faint">
                {t('dash.selectedN', { n: checked.size })}
              </div>
              <div className="space-y-2 text-left">
                <button
                  onClick={() => setMode('compare')}
                  className="w-full rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-on-accent hover:bg-accent-700"
                >
                  {t('dash.compareN', { n: checked.size })}
                </button>
                <p className="text-xs leading-snug text-ink-faint">{t('dash.compareDesc')}</p>
                <button
                  onClick={() => setMode('combine')}
                  className="w-full rounded-lg bg-elevated px-3 py-2 text-sm font-medium text-ink-strong hover:bg-prominent"
                >
                  {t('dash.combine', { n: checked.size })}
                </button>
                <p className="text-xs leading-snug text-ink-faint">{t('dash.combineDesc')}</p>
              </div>
            </div>
          </div>
        ) : selected ? (
          <MotorDetail
            motor={selected}
            curveIndex={curveIdx}
            onCurveChange={setCurveIdx}
            onShowExhaustStyles={() => setMode('exhaust')}
          />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-ink-faint">{t('dash.hint')}</div>
        )}
      </div>
    </div>,
  );
}

export function MotorDashboard({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <MotorDashboardView
      frame={(actions, panes) => (
        <Dialog
          id="motorDashboard"
          fullBleed="xl"
          title={t('dash.title')}
          onClose={onClose}
          size="6xl"
          layout="fill"
          height={760}
          actions={actions}
        >
          {panes}
        </Dialog>
      )}
    />
  );
}
