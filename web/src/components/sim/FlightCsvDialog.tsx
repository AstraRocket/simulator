import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../state/SettingsProvider';
import { useUnits } from '../../prefs/useUnits';
import { Dialog } from '../common/Dialog';
import { flightColumns, type FlightColumn } from '../../services/flight/flightColumns';
import { useWorkspaceStore, selectDesignName } from '../../state/store';
import { flightDataCsv, CSV_MIME } from '../../services/exports/csvExport';
import { exportFilename } from '../../services/files/saveFile';
import { download } from '../../services/files/saveFile';
import type { FlightResult } from '../../engine/openRocketEngine';
import { stageLabel } from '../../i18n/format';
import { Check } from '../common/Check';
import { NumberInput } from '../common/NumberInput';
import { DialogButton } from '../common/DialogButton';

export function FlightCsvDialog({
  result,
  simName,
  onClose,
}: {
  result: FlightResult;
  simName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const designName = useWorkspaceStore(selectDesignName);
  const { settings, update } = useSettings();
  // A stored two-character backslash-t means the tab character.
  const saved =
    settings.flightCsv.separator === '\\t' ? { ...settings.flightCsv, separator: '\t' } : settings.flightCsv;

  const branches = result.branches ?? [];
  const [branchIndex, setBranchIndex] = useState(0);
  // The "#" fallback waits for blur: written at once, Backspace then "%" would read "#%".
  const [commentDraft, setCommentDraft] = useState<string | null>(null);
  const columns = useMemo(() => flightColumns(result, branchIndex), [result, branchIndex]);

  const available = new Set(columns.map((c) => c.key));
  const chosen = saved.columns.filter((k) => available.has(k));

  const patch = (p: Partial<typeof saved>) => update({ flightCsv: { ...saved, ...p } });
  const toggle = (key: string) =>
    patch({ columns: chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key] });

  const name = (c: FlightColumn) => (c.labelKey ? t(c.labelKey) : c.key);
  const unit = (c: FlightColumn) => (c.quantity ? u.sym(c.quantity) : (c.unit ?? ''));

  const onExport = () => {
    const csv = flightDataCsv(result, u.all, { ...saved, columns: chosen, branchIndex, columnName: name }, simName);
    download(exportFilename([designName, simName, 'flight-data'], 'csv'), csv, CSV_MIME);
    onClose();
  };

  const box = 'rounded-lg bg-surface/60 p-3 ring-1 ring-line/10';
  const label = 'mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted';
  const field = 'rounded-md bg-raised px-2 py-1 text-xs text-ink-strong ring-1 ring-line/10';

  return (
    <Dialog
      id="flightCsv"
      title={t('csv.title')}
      onClose={onClose}
      size="3xl"
      layout="fill"
      footer={
        <div className="flex justify-end gap-2 p-3">
          <DialogButton size="sm" onClick={onClose}>
            {t('common.close')}
          </DialogButton>
          <DialogButton variant="primary" size="sm" onClick={onExport} disabled={!chosen.length}>
            {t('csv.export')}
          </DialogButton>
        </div>
      }
    >
      <div className="grid min-h-0 flex-1 gap-3 p-4 md:grid-cols-[1fr_260px]">
        <div className={`${box} flex min-h-0 flex-col`}>
          <div className={label}>{t('csv.variables')}</div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full text-xs">
              <tbody>
                {columns.map((c) => (
                  <tr key={c.key} className="border-b border-line/5">
                    <td className="w-8 py-1">
                      <input
                        type="checkbox"
                        checked={chosen.includes(c.key)}
                        onChange={() => toggle(c.key)}
                        aria-label={name(c)}
                        className="accent-accent-500"
                      />
                    </td>
                    <td className="py-1 text-ink">{name(c)}</td>
                    <td className="w-16 py-1 text-right text-ink-faint">{unit(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-line/10 pt-2">
            <button className={field} onClick={() => patch({ columns: columns.map((c) => c.key) })}>
              {t('csv.selectAll')}
            </button>
            <button className={field} onClick={() => patch({ columns: [] })}>
              {t('csv.selectNone')}
            </button>
            <span className="text-[11px] text-ink-muted">
              {t('csv.count', { count: chosen.length, total: columns.length })}
            </span>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <div className={box}>
            <div className={label}>{t('csv.format')}</div>
            <div className="space-y-2 text-xs text-ink-soft">
              <div className="flex items-center justify-between gap-2">
                <span>{t('csv.separator')}</span>
                <select
                  className={field}
                  aria-label={t('csv.separator')}
                  value={saved.separator}
                  onChange={(e) => patch({ separator: e.target.value })}
                >
                  <option value=",">,</option>
                  <option value=";">;</option>
                  <option value={'\t'}>{t('csv.tab')}</option>
                  <option value=" ">{t('csv.space')}</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>{t('csv.decimals')}</span>
                <NumberInput
                  min={0}
                  max={12}
                  step={1}
                  className={`${field} w-16 text-right`}
                  ariaLabel={t('csv.decimals')}
                  value={saved.decimals}
                  onChange={(v) => v !== null && patch({ decimals: Math.floor(v) })}
                />
              </div>
              <Check
                className=""
                checked={saved.exponential}
                onChange={(v) => patch({ exponential: v })}
                label={t('csv.exponential')}
              />
            </div>
          </div>

          <div className={box}>
            <div className={label}>{t('csv.comments')}</div>
            <div className="space-y-2 text-xs text-ink-soft">
              {(
                [
                  ['simDescription', 'csv.simDescription'],
                  ['fieldDescriptions', 'csv.fieldDescriptions'],
                  ['flightEvents', 'csv.flightEvents'],
                ] as const
              ).map(([key, labelKey]) => (
                <Check
                  key={key}
                  className=""
                  checked={saved[key]}
                  onChange={(v) => patch({ [key]: v })}
                  label={t(labelKey)}
                />
              ))}
              <div className="flex items-center justify-between gap-2">
                <span>{t('csv.commentChar')}</span>
                <input
                  className={`${field} w-16`}
                  aria-label={t('csv.commentChar')}
                  value={commentDraft ?? saved.commentChar}
                  onChange={(e) => {
                    setCommentDraft(e.target.value);
                    if (e.target.value) patch({ commentChar: e.target.value });
                  }}
                  onBlur={() => {
                    if (commentDraft === '') patch({ commentChar: '#' });
                    setCommentDraft(null);
                  }}
                />
              </div>
            </div>
          </div>

          {branches.length > 1 && (
            <div className={box}>
              <div className={label}>{t('csv.stage')}</div>
              <select
                className={`${field} w-full`}
                aria-label={t('csv.stage')}
                value={branchIndex}
                onChange={(e) => setBranchIndex(Number(e.target.value))}
              >
                {branches.map((b, i) => (
                  <option key={i} value={i}>
                    {stageLabel(t, i, b.name)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
