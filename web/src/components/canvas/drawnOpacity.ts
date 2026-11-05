import type { Piece } from './rocketPieces';
import type { Look } from '../../services/design/appearance';

export function drawnOpacity(p: Piece, look: Look, layered: boolean): number {
  const tier = !layered ? 1 : p.translucent ? 0.55 : p.innerGlass ? 0.5 : 1;
  return tier * look.opacity;
}
