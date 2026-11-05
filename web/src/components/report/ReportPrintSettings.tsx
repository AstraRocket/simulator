import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../state/SettingsProvider';
import { Dialog } from '../common/Dialog';
import { DEFAULT_REPORT } from '../../services/storage/settings';
import { ColorInput } from '../common/ColorInput';
import { DialogButton, DialogActions } from '../common/DialogButton';

export function ReportPrintSettings({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const setReport = (patch: Partial<typeof settings.report>) => update({ report: { ...settings.report, ...patch } });
  const select = 'rounded-md bg-raised px-2 py-1 text-sm text-ink-strong ring-1 ring-line/10';
  const check = 'accent-accent-500';
  const fillId = useId();
  return (
    <Dialog
      id="reportPrintSettings"
      title={t('export.printSettings')}
      onClose={onClose}
      layer="over"
      size="sm"
      layout="pad"
      expandable={false}
      fullBleed={false}
    >
      <>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 text-sm text-ink-soft">
            <label htmlFor={fillId}>{t('export.fill')}</label>
            <span className="flex items-center gap-2">
              <input
                id={fillId}
                type="checkbox"
                className={check}
                checked={!!settings.report.templateFill}
                onChange={(e) =>
                  update({
                    report: {
                      ...settings.report,
                      templateFill: e.target.checked ? settings.report.templateFill || '#e5e7eb' : '',
                    },
                  })
                }
              />
              <ColorInput
                disabled={!settings.report.templateFill}
                value={settings.report.templateFill || '#e5e7eb'}
                onCommit={(c) => setReport({ templateFill: c })}
                ariaLabel={t('export.fillColor')}
                className="h-7 w-10 cursor-pointer rounded-md border border-line/10 bg-raised p-0.5 disabled:opacity-40"
              />
            </span>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm text-ink-soft">
            {t('export.border')}
            <ColorInput
              value={settings.report.templateStroke}
              onCommit={(c) => setReport({ templateStroke: c })}
              className="h-7 w-10 cursor-pointer rounded-md border border-line/10 bg-raised p-0.5"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm text-ink-soft">
            {t('export.paper')}
            <select
              value={settings.report.paper}
              onChange={(e) => setReport({ paper: e.target.value as 'letter' | 'a4' })}
              className={select}
            >
              <option value="letter">{t('export.paperLetter')}</option>
              <option value="a4">{t('export.paperA4')}</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-sm text-ink-soft">
            {t('export.orientation')}
            <select
              value={settings.report.orientation}
              onChange={(e) => setReport({ orientation: e.target.value as 'portrait' | 'landscape' })}
              className={select}
            >
              <option value="portrait">{t('export.portrait')}</option>
              <option value="landscape">{t('export.landscape')}</option>
            </select>
          </label>
        </div>
        <DialogActions>
          <DialogButton onClick={() => update({ report: { ...DEFAULT_REPORT, units: settings.report.units } })}>
            {t('export.reset')}
          </DialogButton>
          <DialogButton variant="primary" onClick={onClose}>
            {t('common.close')}
          </DialogButton>
        </DialogActions>
      </>
    </Dialog>
  );
}
