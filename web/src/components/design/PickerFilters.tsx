import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Component } from '../../services/parts/componentDb';
import {
  manufacturers,
  materialFamilies,
  noseShapes,
  queryIsEmpty,
  type ComponentQuery,
} from '../../services/parts/componentFilter';
import { useUnits } from '../../prefs/useUnits';
import { UnitBound } from '../common/UnitBound';
import { Check } from '../common/Check';
import { smallButton } from '../common/smallButton';

export function PickerFilters({
  all,
  q,
  set,
  canFit,
}: {
  all: Component[];
  q: ComponentQuery;
  set: (patch: Partial<ComponentQuery>) => void;
  canFit: boolean;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const mfrs = useMemo(() => manufacturers(all), [all]);
  const mats = useMemo(() => materialFamilies(all), [all]);
  const shapes = useMemo(() => noseShapes(all), [all]);
  // Legacy rows are hidden until checked, as desktop's chooser does.
  const hasLegacy = useMemo(() => all.some((p) => p.legacy), [all]);
  return (
    <div className="flex flex-col gap-2 p-3">
      <input
        value={q.text}
        onChange={(e) => set({ text: e.target.value })}
        autoFocus
        placeholder={t('picker.search')}
        aria-label={t('picker.search')}
        className="w-full rounded-lg bg-canvas px-3 py-2 text-sm text-ink-strong ring-1 ring-line/10 placeholder:text-ink-faint focus:outline-none focus:ring-accent-500"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={q.mfr}
          onChange={(e) => set({ mfr: e.target.value })}
          aria-label={t('picker.colMfr')}
          className="rounded-lg bg-raised px-2 py-2 text-xs text-ink ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
        >
          <option value="">{t('picker.allMfrs')}</option>
          {mfrs.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {mats.length > 1 && (
          <select
            value={q.material}
            onChange={(e) => set({ material: e.target.value })}
            aria-label={t('material.title')}
            className="rounded-lg bg-raised px-2 py-2 text-xs text-ink ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
          >
            <option value="">{t('picker.allMaterials')}</option>
            {mats.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
        {shapes.length > 1 && (
          <select
            value={q.shape}
            onChange={(e) => set({ shape: e.target.value })}
            aria-label={t('prop.shape')}
            className="rounded-lg bg-raised px-2 py-2 text-xs text-ink ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
          >
            <option value="">{t('picker.allShapes')}</option>
            {shapes.map((sh) => (
              <option key={sh} value={sh}>
                {t(`noseShape.${sh}`)}
              </option>
            ))}
          </select>
        )}
        <span className="flex items-center gap-1 text-xs text-ink-muted">
          <span className="text-ink-faint">⌀</span>
          <UnitBound
            quantity="length"
            value={q.odMin}
            onChange={(si) => set({ odMin: si })}
            placeholder={t('picker.odFrom')}
            ariaLabel={t('picker.odFrom')}
            className="w-16 rounded-md bg-canvas px-2 py-1.5 text-right tabular-nums text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
          />
          <span aria-hidden="true">–</span>
          <UnitBound
            quantity="length"
            value={q.odMax}
            onChange={(si) => set({ odMax: si })}
            placeholder={t('picker.odTo')}
            ariaLabel={t('picker.odTo')}
            className="w-16 rounded-md bg-canvas px-2 py-1.5 text-right tabular-nums text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
          />
          <span className="text-ink-faint">{u.sym('length')}</span>
        </span>
        {canFit && (
          <Check
            checked={q.fitsOnly}
            onChange={(v) => set({ fitsOnly: v })}
            label={t('picker.fitsOnly')}
            title={t('picker.fitsHint')}
            className="text-xs text-ink-soft"
          />
        )}
        {hasLegacy && (
          <Check
            checked={q.showLegacy}
            onChange={(v) => set({ showLegacy: v })}
            label={t('picker.showLegacy')}
            className="text-xs text-ink-soft"
          />
        )}
        {!queryIsEmpty(q) && (
          <button
            onClick={() =>
              set({ text: '', mfr: '', material: '', shape: '', odMin: null, odMax: null, fitsOnly: false })
            }
            className={smallButton('row', 'soft', 'ml-auto')}
          >
            {t('picker.clear')}
          </button>
        )}
      </div>
    </div>
  );
}
