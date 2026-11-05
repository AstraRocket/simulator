import type { Look } from '../../services/design/appearance';
import { isSurfaced, SURFACE, type Piece, type RenderMode } from './rocketPieces';

export function surfacesOf(p: Piece, mode: RenderMode): [string, Look][] {
  const looks = p.looks[mode];
  if (!isSurfaced(p.geometry)) return [['material', looks.outside]];
  return [
    [`material-${SURFACE.outside}`, looks.outside],
    [`material-${SURFACE.inside}`, looks.inside],
    [`material-${SURFACE.edges}`, looks.edges],
  ];
}
