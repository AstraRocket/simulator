import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { type ExportData } from '../../services/exports/schematicExport.js';
import { ImageExportMenu } from './ImageExportMenu.js';
import type { RenderMode } from './rocketPieces';
import type { rocketSvg } from './rocketSvgExport';
import type { useRocketExport } from './useRocketExport';
import { SideAftPresets, ViewBtn } from './ViewBtn';
import { Segmented } from '../common/Segmented';
import { SvgExportButton } from './SvgExportButton';

export function Rocket3DToolbar({
  presetSlot,
  ctrlSlot,
  preset,
  showView,
  resetView,
  cutaway,
  setCutaway,
  mode,
  setMode,
  exportData,
  svgSnapshot,
  snapshot,
  onError,
}: {
  presetSlot: HTMLElement | null | undefined;
  ctrlSlot: HTMLElement | null | undefined;
  preset: 'side' | 'aft';
  showView: (which: 'side' | 'aft') => void;
  resetView: () => void;
  cutaway: boolean;
  setCutaway: Dispatch<SetStateAction<boolean>>;
  mode: RenderMode;
  setMode: (mode: RenderMode) => void;
  exportData: ExportData | undefined;
  svgSnapshot: (data: ExportData) => ReturnType<typeof rocketSvg> | null;
  snapshot: ReturnType<typeof useRocketExport>;
  onError: ((message: string) => void) | undefined;
}) {
  const { t } = useTranslation();
  const presets = (
    <SideAftPresets value={preset} onChange={showView} onReset={resetView} resetTitle={t('view.reset3dTitle')} />
  );
  const tools = (
    <>
      <ViewBtn active={cutaway} onClick={() => setCutaway((c) => !c)} title={t('view.cutawayTitle')}>
        {t('view.cutaway')}
      </ViewBtn>
      <Segmented
        size="bar"
        options={['figure', 'finished'] as const}
        value={mode}
        onChange={setMode}
        fmt={(m) => t(m === 'figure' ? 'view.figure' : 'view.finished')}
        title={(m) => t(m === 'figure' ? 'view.figureTitle' : 'view.finishedTitle')}
      />
      {exportData && (
        <SvgExportButton
          title={t('export.svgTitle3d')}
          name={exportData.name}
          view="3d"
          build={() => svgSnapshot(exportData)}
          onError={onError}
        />
      )}
      {exportData && (
        <ImageExportMenu
          icon="📷"
          label={t('export.image')}
          fitOption
          title={t('export.imageTitle3d')}
          onPick={snapshot}
        />
      )}
    </>
  );

  return presetSlot && ctrlSlot ? (
    <>
      {createPortal(presets, presetSlot)}
      {createPortal(tools, ctrlSlot)}
    </>
  ) : (
    <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, display: 'flex', gap: 6 }}>
      {presets}
      {tools}
    </div>
  );
}
