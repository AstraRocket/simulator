/** Why the 3D views are off: no WebGL, too slow, or turned off on the compatibility page. */
export type Graphics3dOff = 'none' | 'slow' | 'off';

export interface Graphics3d {
  enabled: boolean;
  reason: Graphics3dOff | null;
}

/** The message for each reason, in the `graphics` i18n block. */
export const GRAPHICS_OFF_KEY = {
  none: 'graphics.offNone',
  slow: 'graphics.offSlow',
  off: 'graphics.offByHand',
} as const satisfies Record<Graphics3dOff, string>;

const ON: Graphics3d = { enabled: true, reason: null };

/**
 * The decision index.html's startup gate made (public/capability.js), fixed for the page's life.
 * Absent (tests, a page without the gate) means on: the 3D views keep their own no-WebGL handling.
 */
export function graphics3d(): Graphics3d {
  const d = (globalThis as { __astraGraphics?: { enabled?: unknown; reason?: unknown } }).__astraGraphics;
  if (!d || d.enabled !== false) return ON;
  const reason = d.reason === 'none' || d.reason === 'slow' || d.reason === 'off' ? d.reason : 'none';
  return { enabled: false, reason };
}

/** The compatibility page, where the 3D setting lives. */
export const COMPATIBILITY_URL = `${import.meta.env.BASE_URL}compatibility`;
