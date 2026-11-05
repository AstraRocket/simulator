import { rememberedSlot } from './remembered';

interface Remembered {
  boreM: number | null;
  lengthM: number | null;
  pressurePa: number | null;
  pinCount: number | null;
  pinForceN: number | null;
}

export const remembered = rememberedSlot<Remembered>();

export function forgetEjectionTool(): void {
  remembered.forget();
}
