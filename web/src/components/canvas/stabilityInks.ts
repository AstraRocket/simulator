import type { StabilityState } from '../../services/flight/simReport.js';
import type { SceneToken } from './sceneColors';

export const CG_INK = 'scene-cg' satisfies SceneToken;

export const CP_INK = 'scene-cp' satisfies SceneToken;

export const MARGIN_INK: Record<StabilityState, SceneToken> = {
  ok: 'scene-stable-ok',
  over: 'scene-stable-over',
  under: 'scene-stable-under',
};
