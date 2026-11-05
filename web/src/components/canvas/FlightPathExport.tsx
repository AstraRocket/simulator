import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore, selectActive, selectDesignName } from '../../state/store';
import { configFor, primaryMotor } from '../../services/flight/flightConfigs';
import type { ResultFlight } from '../../services/flight/simulations';
import { download as saveDownload, exportFilename } from '../../services/files/saveFile';
import {
  buildFlightPathModel,
  exportBranchNames,
  hasLaunchPosition,
  renderUserTemplate,
  mimeForExtension,
  type Translate,
} from '../../services/exports/flightPathExport';
import { Dialog } from '../common/Dialog';
import { ExportFormatPicker } from './ExportFormatPicker';
import { StageColorDialog } from './StageColorDialog';
import { useExportOptions } from './useExportOptions';
import { useUnits } from '../../prefs/useUnits';
import { useExportTemplates } from './useExportTemplates';
import { DialogButton, DialogActions } from '../common/DialogButton';
import { smallButton } from '../common/smallButton';
import {
  ExportBalloons,
  ExportMission,
  ExportPath,
  ExportPlacement,
  ExportPresets,
  ExportUnits,
  ExportWaypoints,
} from './PathExportSections';

export function FlightPathExport({
  variant = 'chip',
  flight,
}: {
  variant?: 'chip' | 'overlay';
  flight?: ResultFlight | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const active = useWorkspaceStore(selectActive);
  const result = flight ? flight.result : active.result;
  const launch = flight ? flight.launch : active.launch;
  const simName = flight ? flight.name : active.name;
  // The motor the exported flight's own row flies, not the active row's.
  const configId = useWorkspaceStore((s) => (flight && s.sims.find((x) => x.id === flight.id))?.configId);
  const motor = useWorkspaceStore((s) => primaryMotor(s.tree, configFor(s.configs, configId ?? active.configId)));
  const rocketName = useWorkspaceStore(selectDesignName);

  if (!result) return null;

  const btnClass =
    variant === 'overlay'
      ? 'rounded-md bg-surface/80 px-2 py-1 text-[11px] font-medium text-ink ring-1 ring-line/10 hover:bg-raised'
      : smallButton('chip', 'ink');

  return (
    <>
      <button onClick={() => setOpen(true)} title={t('pathExport.open')} className={btnClass}>
        <span aria-hidden>⬇</span> {t('pathExport.short')}
      </button>
      {open && (
        <ExportDialog
          onClose={() => setOpen(false)}
          meta={{ simName, rocketName, motorName: motor?.designation ?? '' }}
          launch={launch}
          result={result}
        />
      )}
    </>
  );
}

// Exported to render on its own: its button lives in the WebGL view, which crashes headless Chromium.
export function ExportDialog({
  onClose,
  meta,
  launch,
  result,
}: {
  onClose: () => void;
  meta: { simName: string; rocketName: string; motorName: string };
  launch: import('../../services/design/orkTree').LaunchConditions;
  result: import('../../engine/openRocketEngine').FlightResult;
}) {
  const { t, i18n } = useTranslation();
  const { opts, patchOpts, change, setUnit } = useExportOptions();
  const units = useUnits();
  const [colorsOpen, setColorsOpen] = useState(false);
  const staged = (result.branches?.length ?? 0) > 1;
  // In the model's numbering, so a swatch lines up with the branch it colors.
  const branchNames = useMemo(() => exportBranchNames(result, meta, t), [result, meta, t]);
  // Every locale is bundled at startup, so `getFixedT` loads nothing; '' follows the app.
  const exportT: Translate = useMemo(
    () => (opts.language ? (i18n.getFixedT(opts.language) as unknown as Translate) : (t as Translate)),
    [opts.language, i18n, t],
  );

  const {
    selected,
    setSelected,
    templates,
    resolved,
    selectedUser,
    error,
    setError,
    onImport,
    deleteSelected,
    downloadTemplate,
  } = useExportTemplates();

  const showPath = !(resolved.kind === 'builtin' && resolved.format.id === 'waypoints-csv');
  const noPosition = !hasLaunchPosition(launch);

  const download = () => {
    try {
      const model = buildFlightPathModel(result, launch, meta, opts, exportT, units.sym('angle'));
      let text: string;
      let ext: string;
      let mime: string;
      if (resolved.kind === 'user') {
        text = renderUserTemplate(resolved.template.source, resolved.template.ext, model);
        ext = resolved.template.ext;
        mime = mimeForExtension(ext);
      } else {
        text = resolved.format.render(model);
        ext = resolved.format.extension;
        mime = resolved.format.mime;
      }
      saveDownload(exportFilename([meta.rocketName, meta.simName, 'flight-path'], ext, 'flight'), text, mime);
      onClose();
    } catch {
      setError(t('pathExport.renderError'));
    }
  };

  return (
    <>
      <Dialog id="pathExport" title={t('pathExport.title')} onClose={onClose} size="md" layout="pad" expandable={false}>
        <div className="space-y-4">
          <ExportFormatPicker
            selected={selected}
            templates={templates}
            canDelete={selectedUser !== null}
            onSelect={(value) => {
              setSelected(value);
              setError(null);
            }}
            onImport={onImport}
            onDownloadTemplate={downloadTemplate}
            onDelete={deleteSelected}
          />

          <ExportPresets opts={opts} change={change} />
          <ExportWaypoints opts={opts} change={change} />
          {showPath && <ExportPath opts={opts} change={change} staged={staged} setColorsOpen={setColorsOpen} />}
          <ExportPlacement opts={opts} change={change} />
          <ExportBalloons opts={opts} change={change} />
          <ExportUnits opts={opts} change={change} setUnit={setUnit} />
          <ExportMission opts={opts} change={change} patchOpts={patchOpts} />

          {noPosition && (
            <p className="rounded-lg bg-warn-500/10 px-3 py-2 text-xs leading-relaxed text-warn-300 ring-1 ring-warn-400/30">
              {t('pathExport.noPosition')}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-error-500/10 px-3 py-2 text-xs leading-relaxed text-error-300 ring-1 ring-error-400/30"
            >
              {error}
            </p>
          )}
        </div>

        <DialogActions>
          <DialogButton onClick={onClose} variant="secondary">
            {t('pathExport.cancel')}
          </DialogButton>
          <DialogButton onClick={download} variant="primary">
            {t('pathExport.download')}
          </DialogButton>
        </DialogActions>
      </Dialog>

      {/* Outside the Dialog, or it inherits the panel's clipping. */}
      {colorsOpen && (
        <StageColorDialog
          names={branchNames}
          colors={opts.branchColors}
          groundColors={opts.branchGroundColors}
          pinColors={opts.branchPinColors}
          onCancel={() => setColorsOpen(false)}
          onApply={(branchColors, branchGroundColors, branchPinColors) => {
            change({ branchColors, branchGroundColors, branchPinColors });
            setColorsOpen(false);
          }}
        />
      )}
    </>
  );
}
