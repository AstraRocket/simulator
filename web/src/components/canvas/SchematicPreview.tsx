import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComponentNode, RocketTree, StaticInfo } from '../../engine/openRocketEngine';
import { partLabel } from '../../i18n/format';
import { computeSchematicLayout, type MotorDims } from '../../tree/schematicGeometry';
import { buildSchematicShapes } from './schematicShapes';
import { SchematicDefs } from './SchematicDefs';
import { StabilityOverlay } from './SchematicOverlay';
import { useElementResize } from '../common/useElementResize';

const NO_RULERS = { top: false, bottom: false, left: false, right: false };
const noHover = () => {};

export function SchematicPreview({
  tree,
  info,
  motors,
  maxHeight = 150,
}: {
  tree: RocketTree;
  info: StaticInfo | null;
  motors?: MotorDims;
  /** px */
  maxHeight?: number;
}) {
  const { t } = useTranslation();
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
  const partName = useCallback((n: ComponentNode) => partLabel(t, n), [t]);
  const typeTag = useCallback((type: string) => t(`schematic.tag.${type}`), [t]);
  const { shapes, overlay, wires, clipDefs } = useMemo(
    () =>
      buildSchematicShapes({ chain, ctx, scale, w, h, roll: 0, uid, motors, setHoverId: noHover, partName, typeTag }),
    [chain, ctx, scale, w, h, uid, motors, partName, typeTag],
  );

  return (
    <div ref={wrapRef}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        aria-hidden
        pointerEvents="none"
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        <SchematicDefs clipDefs={clipDefs} />
        {shapes}
        {overlay}
        {wires}
        <StabilityOverlay info={info} showMarkers ctx={ctx} scale={scale} vHalf={vHalf} w={w} h={h} />
      </svg>
    </div>
  );
}
