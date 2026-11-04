import type { RefObject } from 'react';
import { zoomStep, type ZoomState } from '../../tree/schematicGeometry';
import { useNativeWheel } from '../common/useNativeWheel';

/** Native and non-passive because React's onWheel is passive and cannot preventDefault. */
export function useWheelZoom(
  ref: RefObject<SVGSVGElement | null>,
  setZoom: (f: (z: ZoomState) => ZoomState) => void,
  toView: ((e: WheelEvent, rect: DOMRect) => { px: number; py: number }) | null,
  opts: { factor: number; max: number },
): void {
  useNativeWheel(
    ref,
    (e) => {
      const svg = ref.current;
      if (!svg || !toView) return;
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const { px, py } = toView(e, rect);
      const step = e.deltaY < 0 ? opts.factor : 1 / opts.factor;
      setZoom((z) => zoomStep(z, px, py, step, opts.max));
    },
    toView !== null,
  );
}
