import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { Dialog } from '../common/Dialog';
import { printableParts } from '../../services/exports/printableParts';
import { partLabel } from '../../i18n/format';
import { Check } from '../common/Check';
import { DialogButton } from '../common/DialogButton';
import { toggled } from '../../services/app/collections';

export function PrintExportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const exportPrint = useWorkspaceStore((s) => s.exportPrint);

  const parts = useMemo(() => printableParts(tree), [tree]);
  const label = (p: (typeof parts)[number]) => partLabel(t, p);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [separateFiles, setSeparateFiles] = useState(false);
  const [placeOnPlate, setPlaceOnPlate] = useState(true);

  // Exclusions, so a part added behind the dialog is included.
  const selected = parts.filter((p) => !excluded.has(p.id));
  const toggle = (id: string) => setExcluded((prev) => toggled(prev, id));

  const empty = parts.length === 0;
  return (
    <Dialog
      id="printExport"
      title={t('print.title')}
      onClose={onClose}
      size="lg"
      toolbar={empty ? undefined : <p className="px-4 py-2 text-xs leading-snug text-ink-muted">{t('print.intro')}</p>}
      footer={
        empty ? undefined : (
          <>
            <div className="space-y-2 px-4 py-3">
              <Check
                className="text-xs text-ink-soft"
                checked={separateFiles}
                onChange={setSeparateFiles}
                label={t('print.separateFiles')}
              />
              <Check
                className="text-xs text-ink-soft"
                checked={placeOnPlate}
                onChange={setPlaceOnPlate}
                label={t('print.placeOnPlate')}
              />
              <p className="text-[11px] leading-snug text-ink-faint">{t('print.orientationNote')}</p>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line/10 px-4 py-3">
              <span className="text-xs text-ink-muted">{t('print.count', { count: selected.length })}</span>
              <DialogButton
                disabled={selected.length === 0}
                onClick={() => {
                  void exportPrint({
                    include: new Set(selected.map((p) => p.id)),
                    separateFiles,
                    placeOnPlate,
                    labels: Object.fromEntries(selected.map((p) => [p.id, label(p)])),
                  });
                  onClose();
                }}
                variant="primary"
              >
                {t('print.save')}
              </DialogButton>
            </div>
          </>
        )
      }
    >
      {empty ? (
        <p className="px-4 py-8 text-center text-sm text-ink-muted">{t('print.nothing')}</p>
      ) : (
        <ul className="px-4 py-2">
          {parts.map((p) => (
            <li key={p.id} style={{ paddingLeft: `${p.depth * 14}px` }}>
              <Check
                className="py-1 text-sm text-ink"
                checked={!excluded.has(p.id)}
                onChange={() => toggle(p.id)}
                label={label(p)}
              />
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
