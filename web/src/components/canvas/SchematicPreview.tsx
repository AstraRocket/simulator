import { useId, useMemo, useRef, useState } from 'react';
import type { RocketTree, StaticInfo } from '../../engine/openRocketEngine';
import { computeSchematicLayout, type MotorDims } from '../../tree/schematicGeometry';
import { buildSchematicShapes } from './schematicShapes';
import { StabilityOverlay } from './SchematicOverlay';
import { useElementResize } from '../common/useElementResize';
import { token } from '../common/colorTokens';

/** No rulers: a preview is for recognizing the rocket, not measuring it. */
const NO_RULERS = { top: false, bottom: false, left: false, right: false };
/** Hover writer for the shapes; a preview has no hover tag to drive. */
const noHover = () => {};

/**
 * The 2D side view, drawn small and still: the same part outlines and CG/CP
 * markers as TreeSchematic, with none of its pan, zoom, roll, calipers or
 * selection. Sideways across the full width, which is the size a hobby rocket
 * (15-25x longer than it is wide) draws biggest at in a short band.
 *
 * Height follows the rocket's proportions up to `maxHeight`, the same fit the
 * Sketch view makes; a long thin rocket gets a low band.
 */
export function SchematicPreview({
  tree,
  info,
  motors,
  maxHeight = 150,
}: {
  tree: RocketTree;
  info: StaticInfo | null;
  motors?: MotorDims;
  /** Cap on the band's height (px). */
  maxHeight?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(360);
  useElementResize(wrapRef, (_r, el) => {
    if (el.clientWidth > 0) setCw(el.clientWidth);
  });

  const layout = useMemo(
    () => computeSchematicLayout(tree, info, { chPx: 0, cw, maxHeight, rulers: NO_RULERS }),
    [tree, info, cw, maxHeight],
  );
  const { chain, vHalf, w, h, scale, ctx } = layout;
  const uid = useId().replace(/:/g, '');
  const { shapes, overlay, wires, clipDefs } = useMemo(
    () => buildSchematicShapes({ chain, ctx, scale, w, h, roll: 0, uid, motors, setHoverId: noHover }),
    [chain, ctx, scale, w, h, uid, motors],
  );

  return (
    <div ref={wrapRef}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        aria-hidden
        pointerEvents="none"
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        <defs>
          <pattern id="bulkhead-hatch" patternUnits="userSpaceOnUse" width="5" height="5">
            <path d="M0 5 L5 0" stroke={token('sch-hatch')} strokeWidth="0.9" />
          </pattern>
          {clipDefs}
        </defs>
        {shapes}
        {overlay}
        {wires}
        <StabilityOverlay info={info} showMarkers ctx={ctx} scale={scale} vHalf={vHalf} w={w} h={h} />
      </svg>
    </div>
  );
}
