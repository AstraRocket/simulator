import { useTranslation } from 'react-i18next';
import { useSettings } from '../../state/useSettings';
import { UNIT_CHOICES, type UnitChoice } from '../../prefs/units';
import { Check } from '../common/Check';
import { SelectRow } from '../common/SelectRow';
import type { ReportSelection, Sel } from './useReportDialog';

const row = 'flex items-center gap-2 py-0.5 text-sm text-ink';

export function ReportSelectionPanel({ name, sel, selection }: { name: string; sel: Sel; selection: ReportSelection }) {
  const { t } = useTranslation();
  const { settings, updateSection } = useSettings();
  const { patch, patchStage, allOn, setAll, hasNoses, hasTransitions, hasMarkingGuides } = selection;
  const setUnits = (units: UnitChoice) => updateSection('report', { units });
  return (
    <div className="p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-ink-muted">{t('export.select')}</p>
      <div className="rounded-lg bg-raised/50 p-2 ring-1 ring-line/5">
        <Check className={`${row} font-semibold text-accent-300`} checked={allOn} onChange={setAll} label={name} />
        {sel.stages.map((st, i) => (
          <div key={i} className="pl-4">
            <div className={`${row} text-ink-soft`}>{st.label}</div>
            <Check
              className={`${row} pl-4`}
              checked={st.parts}
              onChange={(v) => patchStage(i, { parts: v })}
              label={t('report.partsDetail')}
            />
            {st.hasFins && (
              <Check
                className={`${row} pl-4`}
                checked={st.finTemplates}
                onChange={(v) => patchStage(i, { finTemplates: v })}
                label={t('export.finTemplates')}
              />
            )}
          </div>
        ))}
        <Check
          className={`${row} pl-4`}
          checked={sel.designReport}
          onChange={(v) => patch({ designReport: v })}
          label={t('export.designReport')}
        />
        <Check
          className={`${row} pl-4`}
          disabled={!hasNoses}
          checked={sel.noseTemplates}
          onChange={(v) => patch({ noseTemplates: v })}
          label={t('export.noseTemplates')}
        />
        <Check
          className={`${row} pl-4`}
          disabled={!hasTransitions}
          checked={sel.transitionTemplates}
          onChange={(v) => patch({ transitionTemplates: v })}
          label={t('export.transitionTemplates')}
        />
        <Check
          className={`${row} pl-4`}
          disabled={!hasMarkingGuides}
          checked={sel.finMarkingGuide}
          onChange={(v) => patch({ finMarkingGuide: v })}
          label={t('export.finMarkingGuide')}
        />
      </div>

      <div className="mt-3 space-y-1">
        <Check
          className={row}
          checked={sel.includeMotors}
          onChange={(v) => patch({ includeMotors: v })}
          label={t('export.includeMotors')}
        />
        <Check
          className={row}
          checked={sel.updateSimData}
          onChange={(v) => patch({ updateSimData: v })}
          label={t('export.updateSim')}
        />
        <Check
          className={row}
          checked={sel.showByStage}
          onChange={(v) => patch({ showByStage: v })}
          label={t('export.showByStage')}
        />
        <SelectRow<UnitChoice>
          label={t('export.units')}
          value={settings.report.units}
          onChange={setUnits}
          labelClassName="text-sm text-ink"
          className="pt-1"
        >
          {UNIT_CHOICES.map((c) => (
            <option key={c} value={c}>
              {t(`export.units_${c}`)}
            </option>
          ))}
        </SelectRow>
        <p className="text-[11px] leading-snug text-ink-faint">{t('export.unitsNote')}</p>
      </div>
    </div>
  );
}
