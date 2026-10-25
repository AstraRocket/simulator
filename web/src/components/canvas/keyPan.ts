import type { KeyboardEvent } from 'react';
import type { ZoomState } from '../../tree/schematicGeometry';

/** The fraction of the view one arrow press moves it; Shift moves five times as far. */
const STEP = 0.1;

/**
 * Pan a zoomed view from the keyboard: the arrows bring the part of the drawing
 * on that side into view, the way a drag toward the other side would. `span` is
 * the view's width in its own (viewBox) units.
 *
 * Returns null for a key that is not a pan or a view that is not zoomed in: at
 * the fitted view the whole drawing is already on screen, so there is nothing
 * to bring in, and the key is left to whatever else answers it.
 */
export function keyPan(z: ZoomState, key: string, shift: boolean, span: number): ZoomState | null {
  if (z.k <= 1) return null;
  const d = span * STEP * (shift ? 5 : 1);
  switch (key) {
    case 'ArrowLeft':
      return { ...z, x: z.x + d };
    case 'ArrowRight':
      return { ...z, x: z.x - d };
    case 'ArrowUp':
      return { ...z, y: z.y + d };
    case 'ArrowDown':
      return { ...z, y: z.y - d };
    default:
      return null;
  }
}

/**
 * What the side and aft views' zoomable SVG share: a grab cursor and focus
 * once zoomed in, so the arrows can pan (a drag is otherwise the only way to
 * bring the far end into view), and the pan hint in the name only then. The
 * pointer handlers differ by view and stay with each.
 */
export function zoomSurfaceProps(
  zoom: ZoomState,
  setZoom: (z: ZoomState) => void,
  span: number,
  aria: string,
  panHint: string,
) {
  const zoomed = zoom.k > 1;
  return {
    style: { touchAction: 'none', cursor: zoomed ? 'grab' : undefined },
    'aria-label': zoomed ? `${aria}. ${panHint}` : aria,
    tabIndex: zoomed ? 0 : undefined,
    className: 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500',
    onKeyDown: (e: KeyboardEvent) => {
      const next = keyPan(zoom, e.key, e.shiftKey, span);
      if (!next) return;
      e.preventDefault();
      setZoom(next);
    },
  } as const;
}
