import { useEffect, useMemo } from 'react';
import type { RocketTree } from '../../engine/openRocketEngine';
import type { PartPalette } from '../../services/design/partColors';
import type { MotorDims } from '../../tree/schematicGeometry';
import { buildPieces } from './rocketPieces';

/** Mesh keys are stable, so R3F never auto-disposes replaced geometries; this must, or GPU buffers leak. */
export function usePieces(tree: RocketTree, motors: MotorDims | undefined, palette: PartPalette) {
  const built = useMemo(() => buildPieces(tree, motors, palette), [tree, motors, palette]);
  const { pieces } = built;
  useEffect(
    () => () => {
      for (const p of pieces) p.geometry.dispose();
    },
    [pieces],
  );
  return built;
}
