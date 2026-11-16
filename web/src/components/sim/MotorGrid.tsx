import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { hasCurve, type CatalogMotor } from '../../services/motors/motorDb';
import { useUnits } from '../../prefs/useUnits';
import { MotorCatalogGate } from './MotorCatalogGate';
import { keyOf } from '../../services/motors/motorKey';
import { ALIGN, COLUMNS, heading, type Col } from './motorColumns';
import type { MotorSort } from './useMotorSort';
import { SortHeader } from '../common/SortHeader';
import { CheckMenu } from '../common/CheckMenu';
import { takesArrowKeys } from '../common/isTextEntry';
import { ImportedStar } from './ImportedStar';

export function ColumnChooser({ visCols, onToggle }: { visCols: string[]; onToggle: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <CheckMenu
      summary={t('dash.columns')}
      items={COLUMNS.filter((c) => !c.always).map((c) => ({
        key: c.id,
        label: t(`dash.${c.label}`),
        checked: visCols.includes(c.id),
      }))}
      onToggle={onToggle}
      width="w-56"
      align="right"
    />
  );
}

export function MotorGrid({
  shown,
  cols,
  sort,
  onSort,
  selected,
  onSelect,
  checked,
  onToggleCheck,
  catalogLoading,
  catalogError,
  onRetry,
  active,
}: {
  shown: CatalogMotor[];
  cols: Col[];
  sort: MotorSort | null;
  onSort: (id: string) => void;
  selected: CatalogMotor | null;
  onSelect: (m: CatalogMotor | null) => void;
  checked: Map<string, CatalogMotor>;
  onToggleCheck: (m: CatalogMotor) => void;
  catalogLoading: boolean;
  catalogError: string | null;
  onRetry: () => void;
  /** The arrow-key stepper is a `window` listener and the grid stays mounted while hidden. */
  active: boolean;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (takesArrowKeys(e.target as Element) || !shown.length) return;
      // On the Tools tab a dialog can sit over the grid, and the key is the dialog's.
      const dialog = e.target instanceof Element ? e.target.closest('[role="dialog"]') : null;
      if (dialog && !dialog.contains(bodyRef.current)) return;
      e.preventDefault();
      const i = selected ? shown.findIndex((m) => keyOf(m) === keyOf(selected)) : -1;
      onSelect(shown[e.key === 'ArrowDown' ? Math.min(shown.length - 1, i + 1) : Math.max(0, i - 1)] ?? null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, shown, selected, onSelect]);

  useEffect(() => {
    if (!selected) return;
    const row = bodyRef.current?.querySelector(`[data-key="${CSS.escape(keyOf(selected))}"]`);
    row?.scrollIntoView({ block: 'nearest' });
    // Focus follows only while in the grid, so screen readers announce the step.
    if (bodyRef.current?.contains(document.activeElement)) {
      row?.querySelector<HTMLElement>('[data-row-handle]')?.focus({ preventScroll: true });
    }
  }, [selected]);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-collapse whitespace-nowrap text-sm">
          <thead className="sticky top-0 z-10 bg-surface text-[10px] uppercase tracking-wide text-ink-faint">
            <tr>
              <th scope="col" className="w-8 px-2 py-1.5">
                <span className="sr-only">{t('dash.compareTitle')}</span>
              </th>
              {cols.map((c) => (
                <SortHeader
                  key={c.id}
                  className={`px-2 py-1.5 font-semibold ${ALIGN[c.align]}`}
                  active={sort?.id === c.id}
                  dir={sort?.dir === -1 ? -1 : 1}
                  onSort={c.sortVal ? () => onSort(c.id) : undefined}
                >
                  {heading(c, t, u)}
                </SortHeader>
              ))}
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {(catalogLoading || catalogError) && (
              <tr>
                <td colSpan={cols.length + 1} className="p-4">
                  <MotorCatalogGate loading={catalogLoading} error={catalogError} onRetry={onRetry} />
                </td>
              </tr>
            )}
            {shown.map((m) => {
              const k = keyOf(m);
              const isSel = !!selected && keyOf(selected) === k;
              return (
                <tr
                  key={k}
                  data-key={k}
                  onClick={() => onSelect(m)}
                  className={`cursor-pointer border-t border-line/5 tabular-nums ${isSel ? 'bg-accent-600/25' : 'hover:bg-raised/60'}`}
                >
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={checked.has(k)}
                      disabled={!hasCurve(m)}
                      aria-label={t('dash.select', { name: m.designation })}
                      title={hasCurve(m) ? undefined : t('dash.noCurveTip')}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => onToggleCheck(m)}
                      className="accent-accent-500 disabled:opacity-30"
                    />
                  </td>
                  {cols.map((c) => (
                    <td
                      key={c.id}
                      className={`px-2 py-1.5 ${ALIGN[c.align]} ${c.always ? 'font-medium text-ink-strong' : 'text-ink-soft'}`}
                    >
                      {c.always ? (
                        <button
                          type="button"
                          data-row-handle
                          aria-current={isSel || undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(m);
                          }}
                          className="rounded-sm text-left font-data font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                        >
                          {m.custom && <ImportedStar />}
                          {c.cell(m, u, t)}
                        </button>
                      ) : (
                        c.cell(m, u, t)
                      )}
                      {c.always && !hasCurve(m) && (
                        <span className="ml-1.5 rounded bg-elevated px-1 py-0.5 text-[9px] font-normal uppercase tracking-wide text-ink-soft">
                          {t('dash.noCurve')}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line/10 p-2 text-center text-[11px] uppercase tracking-wide text-ink-faint">
        {t('motor.count', { total: shown.length })}
      </div>
    </>
  );
}
