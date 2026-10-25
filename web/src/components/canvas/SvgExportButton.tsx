import { useTranslation } from 'react-i18next';
import { errorText } from '../../i18n/keyedError';
import { SVG_MIME } from '../../services/exports/schematicExport';
import { download, exportFilename } from '../../services/files/saveFile';

/**
 * The 2D and 3D views' "⬇ SVG" button: builds the drawing, saves it as
 * `<design>-<view>.svg`, and reports a failure through `onError` rather than
 * letting a click handler throw into nothing. `build` returns null when there
 * is nothing to draw yet (no canvas mounted), which saves nothing.
 */
export function SvgExportButton({
  title,
  name,
  view,
  build,
  onError,
}: {
  title: string;
  name: string;
  view: '2d' | '3d';
  build: () => string | null;
  onError?: (message: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      className="file-btn"
      title={title}
      onClick={() => {
        try {
          const svg = build();
          if (svg != null) download(exportFilename([name, view], 'svg'), svg, SVG_MIME);
        } catch (e) {
          onError?.(t('export.svgFailed', { message: errorText(e, t) }));
        }
      }}
    >
      <span aria-hidden>⬇</span> SVG
    </button>
  );
}
