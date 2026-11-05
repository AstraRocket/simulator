import { rememberedSlot } from './remembered';
import type { FinStock } from '../../state/finFlutterChoices';

export interface Remembered {
  rootM: number | null;
  tipM: number | null;
  spanM: number | null;
  thicknessM: number | null;
  material: FinStock;
  shearPa: number | null;
  speedMs: number | null;
  altitudeM: number | null;
  siteM: number | null;
}

export const remembered = rememberedSlot<Remembered>();

export function forgetFlutterTool(): void {
  remembered.forget();
}
