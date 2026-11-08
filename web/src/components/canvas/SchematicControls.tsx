import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { IMAGE_FORMAT_EXT, schematicSvg, svgToImage, type ExportData } from '../../services/exports/schematicExport.js';
import { download, exportFilename } from '../../services/files/saveFile.js';
import { ImageExportMenu } from './ImageExportMenu.js';
import { errorText } from '../../i18n/keyedError';
import { token } from '../common/colorTokens';
import { SvgExportButton } from './SvgExportButton';
import { ToolDivider } from './ViewBtn';

// Model meters.
type Caliper = { a: number; b: number } | null;

export function SchematicControls({
  svgRef,
  exportData,
  onError,
  scale,
  w,
  h,
  totalLen,
  maxR,
  caliperH,
  caliperV,
  setCaliperH,
  setCaliperV,
}: {
  svgRef: RefObject<SVGSVGElement | null>;
  exportData?: ExportData;
  onError?: (message: string) => void;
  scale: number;
  w: number;
  h: number;
  totalLen: number;
  maxR: number;
  caliperH: Caliper;
  caliperV: Caliper;
  setCaliperH: Dispatch<SetStateAction<Caliper>>;
  setCaliperV: Dispatch<SetStateAction<Caliper>>;
}) {
  const { t } = useTranslation();
  return (
    <>
      {exportData && (
        <>
          <SvgExportButton
            title={t('export.svgTitle')}
            name={exportData.name}
            view="2d"
            build={() => (svgRef.current ? schematicSvg(svgRef.current, scale, w, h, exportData) : null)}
            onError={onError}
          />
          <ImageExportMenu
            icon="⬇"
            label={t('export.image')}
            title={t('export.imageTitle2d')}
            onPick={async (format, widthPx) => {
              if (!svgRef.current) return;
              try {
                const data = exportData;
                const svg = schematicSvg(svgRef.current, scale, w, h, data);
                download(
                  exportFilename([data.name, '2d'], IMAGE_FORMAT_EXT[format]),
                  await svgToImage(svg, widthPx, format),
                );
              } catch (e) {
                onError?.(t('export.imageFailed', { message: errorText(e, t) }));
              }
            }}
          />
          <ToolDivider />
        </>
      )}
      <button
        className="file-btn"
        title={t('schematic.calipersH')}
        aria-label={t('schematic.calipersH')}
        aria-pressed={!!caliperH}
        style={caliperH ? { background: 'var(--accent)', color: token('on-accent') } : undefined}
        onClick={() => setCaliperH((c) => (c ? null : { a: totalLen * 0.2, b: totalLen * 0.8 }))}
      >
        <span aria-hidden>↔</span>
        <span className="hidden @[63rem]/bar:inline">{t('schematic.caliperLength')}</span>
      </button>
      <button
        className="file-btn"
        title={t('schematic.calipersV')}
        aria-label={t('schematic.calipersV')}
        aria-pressed={!!caliperV}
        style={caliperV ? { background: 'var(--accent)', color: token('on-accent') } : undefined}
        onClick={() => setCaliperV((c) => (c ? null : { a: maxR, b: -maxR }))}
      >
        <span aria-hidden>↕</span>
        <span className="hidden @[63rem]/bar:inline">{t('schematic.caliperDiameter')}</span>
      </button>
    </>
  );
}
