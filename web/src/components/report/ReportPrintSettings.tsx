import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../state/useSettings';
import { Dialog } from '../common/Dialog';
import { DEFAULT_REPORT } from '../../services/storage/settings';
import { ColorField, ColorInput } from '../common/ColorInput';
import { DialogButton, DialogActions } from '../common/DialogButton';
import { SelectRow } from '../common/SelectRow';

export function ReportPrintSettings({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { settings, update, updateSection } = useSettings();
  const setReport = (patch: Partial<typeof settings.report>) => updateSection('report', patch);
  const label = 'text-sm text-ink-soft';
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
          <div className={`flex items-center justify-between gap-3 ${label}`}>
            <label htmlFor={fillId}>{t('export.fill')}</label>
            <span className="flex items-center gap-2">
              <input
                id={fillId}
                type="checkbox"
                className={check}
                checked={!!settings.report.templateFill}
                onChange={(e) =>
                  setReport({ templateFill: e.target.checked ? settings.report.templateFill || '#e5e7eb' : '' })
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
          <ColorField
            label={t('export.border')}
            value={settings.report.templateStroke}
            onCommit={(c) => setReport({ templateStroke: c })}
            labelClassName={label}
          />
          <SelectRow<'letter' | 'a4'>
            label={t('export.paper')}
            value={settings.report.paper}
            onChange={(paper) => setReport({ paper })}
            labelClassName={label}
          >
            <option value="letter">{t('export.paperLetter')}</option>
            <option value="a4">{t('export.paperA4')}</option>
          </SelectRow>
          <SelectRow<'portrait' | 'landscape'>
            label={t('export.orientation')}
            value={settings.report.orientation}
            onChange={(orientation) => setReport({ orientation })}
            labelClassName={label}
          >
            <option value="portrait">{t('export.portrait')}</option>
            <option value="landscape">{t('export.landscape')}</option>
          </SelectRow>
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
