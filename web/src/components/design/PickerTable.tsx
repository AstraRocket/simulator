import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Component } from '../../services/parts/componentDb';
import type { ComponentQuery, Ranked, SortKey } from '../../services/parts/componentFilter';
import { SortHeader } from '../common/SortHeader';

import { sameName } from '../../services/app/names';
export interface CurrentPart {
  manufacturer?: string;
  partNo?: string;
}

const sameText = (a: string | undefined, b: string | undefined): boolean => a != null && b != null && sameName(a, b);

/** Part numbers are unique only within a manufacturer, so both must match. */
function isCurrent(part: Pick<Component, 'mfr' | 'partNo'>, current: CurrentPart | undefined): boolean {
  return current != null && sameText(part.partNo, current.partNo) && sameText(part.mfr, current.manufacturer);
}

export interface Col {
  key: string;
  head: string;
  sort?: SortKey;
  num?: boolean;
  /** Required on every column but the slack one: with `table-layout: auto` columns jump on every keystroke. */
  w?: string;
  hide?: string;
  cell: (r: Ranked<Component>) => string;
  title?: (r: Ranked<Component>) => string;
  render?: (r: Ranked<Component>) => ReactNode;
  headSrOnly?: boolean;
}

export function PickerTable({
  cols,
  shown,
  q,
  set,
  current,
  onApply,
}: {
  cols: Col[];
  shown: Ranked<Component>[];
  q: ComponentQuery;
  set: (patch: Partial<ComponentQuery>) => void;
  current: CurrentPart | undefined;
  onApply: (p: Component) => void;
}) {
  const { t } = useTranslation();
  const sortBy = (key: SortKey) => set(key === q.sort ? { dir: q.dir === 1 ? -1 : 1 } : { sort: key, dir: 1 });

  // `table-fixed`: see Col.w.
  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-surface text-[11px] uppercase tracking-wide text-ink-muted">
        <tr>
          {cols.map((c) => (
            <SortHeader
              key={c.key}
              className={`border-b border-line/10 px-2 py-2 font-medium ${c.num ? 'text-right' : 'text-left'} ${c.w ?? ''} ${c.hide ?? ''}`}
              active={c.sort === q.sort}
              dir={q.dir === 1 ? 1 : -1}
              onSort={c.sort ? () => c.sort && sortBy(c.sort) : undefined}
            >
              {c.headSrOnly && !c.sort ? <span className="sr-only">{c.head}</span> : c.head}
            </SortHeader>
          ))}
        </tr>
      </thead>
      <tbody>
        {shown.map((r, i) => (
          <tr
            key={r.part.id ?? `${r.part.mfr}:${r.part.partNo}:${i}`}
            // Pointer only; the part-number button is the keyboard target. A button row would swallow delete.
            onClick={() => onApply(r.part)}
            aria-current={isCurrent(r.part, current) ? 'true' : undefined}
            className={`cursor-pointer border-b border-line/5 hover:bg-raised focus-within:bg-raised ${
              isCurrent(r.part, current) ? 'bg-raised font-semibold text-accent-300' : 'text-ink-soft'
            }`}
          >
            {cols.map((c) => (
              <td
                key={c.key}
                title={c.title?.(r) || undefined}
                className={`truncate px-2 py-1.5 ${c.num ? 'text-right tabular-nums' : ''} ${
                  c.key === 'partNo' ? 'font-medium text-ink-strong' : ''
                } ${c.key === 'notes' || c.key === 'material' ? 'text-ink-faint' : ''} ${c.hide ?? ''}`}
              >
                {c.key === 'partNo' ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // the row's own click would apply it twice
                      onApply(r.part);
                    }}
                    aria-current={isCurrent(r.part, current) ? 'true' : undefined}
                    className="max-w-full truncate text-left focus:outline-none focus-visible:underline"
                  >
                    {c.cell(r)}
                  </button>
                ) : c.render ? (
                  c.render(r)
                ) : (
                  c.cell(r)
                )}
              </td>
            ))}
          </tr>
        ))}
        {shown.length === 0 && (
          <tr>
            <td colSpan={cols.length} className="px-3 py-8 text-center text-sm text-ink-faint">
              {t('picker.noResults')}
              {q.fitsOnly && <div className="mt-1 text-xs text-ink-dim">{t('picker.fitsHint')}</div>}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
