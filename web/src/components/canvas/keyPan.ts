import type { KeyboardEvent } from 'react';
import type { ZoomState } from '../../tree/schematicGeometry';

const STEP = 0.1; // fraction of the view

// Null when not a pan key or not zoomed, leaving the key to others.
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
