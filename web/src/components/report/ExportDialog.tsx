import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../common/Dialog';
import { DialogButton } from '../common/DialogButton';
import { ReportPrintSettings } from './ReportPrintSettings';
import { ReportSelectionPanel } from './ReportSelectionPanel';
import { useAssembledReport, useReportActions, useReportSelection } from './useReportDialog';

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);
  const model = useAssembledReport();
  const selection = useReportSelection(model);
  const { sel } = selection;
  const { busy, close, save, saveCsv, savePartsCsv } = useReportActions(model, sel, onClose);

  const actionRow = (
    <div className="flex items-center justify-between gap-2 border-t border-line/10 p-4">
      <DialogButton onClick={() => setShowSettings(true)}>{t('export.settings')}</DialogButton>
      <div className="flex gap-2">
        <DialogButton onClick={close}>{t('common.cancel')}</DialogButton>
        <DialogButton onClick={saveCsv} disabled={busy}>
          {t('export.saveCsv')}
        </DialogButton>
        <DialogButton onClick={savePartsCsv} disabled={busy}>
          {t('export.savePartsCsv')}
        </DialogButton>
        <DialogButton onClick={save} disabled={busy} variant="primary">
          {busy ? t('common.loading') : t('export.savePdf')}
        </DialogButton>
      </div>
    </div>
  );

  return (
    <>
      <Dialog
        id="reportExport"
        title={t('export.title')}
        onClose={close}
        size="md"
        dismissible={!busy}
        footer={sel && model ? actionRow : undefined}
      >
        {sel && model ? (
          <ReportSelectionPanel name={model.name} sel={sel} selection={selection} />
        ) : (
          <p className="p-6 text-sm text-ink-faint">{t('report.noDesign')}</p>
        )}
      </Dialog>

      {showSettings && <ReportPrintSettings onClose={() => setShowSettings(false)} />}
    </>
  );
}
