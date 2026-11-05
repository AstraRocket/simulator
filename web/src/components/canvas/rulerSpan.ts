import { RULER_W } from '../../tree/schematicGeometry';
import type { RulerSides } from './SchematicRulers';

export const CORNER_GAP = 5;

/** viewBox px the length rulers run between, which the calipers stop at too. */
export const rulerSpan = (rulers: RulerSides, w: number) => ({
  rulerX0: rulers.left ? RULER_W - 4 + CORNER_GAP : 2,
  rulerX1: rulers.right ? w - RULER_W + 4 - CORNER_GAP : w - 2,
});
