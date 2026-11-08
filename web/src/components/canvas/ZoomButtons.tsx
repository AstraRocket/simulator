import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_ZOOM, ZOOM_IDENTITY, isZoomIdentity, type ZoomState } from '../../tree/schematicGeometry';
import { JOINED, ToolGroup } from './ViewBtn';

const ZOOM_STEP = 1.5;

const ZOOM_BTN = `${JOINED} bg-raised text-ink-soft hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40`;

export function ZoomButtons({
  zoom,
  setZoom,
  zoomBy,
}: {
  zoom: ZoomState;
  setZoom: Dispatch<SetStateAction<ZoomState>>;
  zoomBy: (f: number) => void;
}) {
  const { t } = useTranslation();
  const atDefault = isZoomIdentity(zoom);
  return (
    <ToolGroup>
      <button
        type="button"
        className={`${ZOOM_BTN} w-7`}
        title={t('schematic.zoomIn')}
        aria-label={t('schematic.zoomIn')}
        onClick={() => zoomBy(ZOOM_STEP)}
        disabled={zoom.k >= MAX_ZOOM}
      >
        +
      </button>
      <button
        type="button"
        className={`${ZOOM_BTN} w-7`}
        title={t('schematic.zoomOut')}
        aria-label={t('schematic.zoomOut')}
        onClick={() => zoomBy(1 / ZOOM_STEP)}
        disabled={zoom.k <= 1}
      >
        −
      </button>
      <button
        type="button"
        className={ZOOM_BTN}
        title={t('schematic.fit')}
        aria-label={t('schematic.fit')}
        onClick={() => setZoom(ZOOM_IDENTITY)}
        disabled={atDefault}
      >
        {t('schematic.fitShort')}
      </button>
    </ToolGroup>
  );
}
