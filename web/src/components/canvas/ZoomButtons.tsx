import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_ZOOM, ZOOM_IDENTITY, isZoomIdentity, type ZoomState } from '../../tree/schematicGeometry';
import { JOINED, ToolGroup } from './ViewBtn';

/** One click of zoom-in or zoom-out scales the view by this factor. */
const ZOOM_STEP = 1.5;

/** One button of the joined zoom block: an action, so the off ink only. */
const ZOOM_BTN = `${JOINED} bg-raised text-ink-soft hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40`;

/**
 * Zoom in, zoom out and fit, shared by the side schematic and the aft view.
 * One joined block over the drawing's corner, beside what it changes rather
 * than in the header row.
 *
 * At the default view zoom-out and fit are no-ops (`zoomBy` clamps the scale at
 * 1, and fit sets the view to `ZOOM_IDENTITY`, which it already is), so both are
 * disabled there rather than clickable and inert. Zoom-in disables at
 * `MAX_ZOOM`, the ceiling both views' wheel handlers clamp to.
 */
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
        {/* A word: ⤢ is also the maximize button's glyph, in the header row. */}
        {t('schematic.fitShort')}
      </button>
    </ToolGroup>
  );
}
