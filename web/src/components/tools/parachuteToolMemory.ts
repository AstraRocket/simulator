import { rememberedSlot } from './remembered';

interface Remembered {
  massKg: number | null;
  cd: number | null;
  diameterM: number | null;
  siteM: number | null;
  temperatureC: number | null;
}

export const remembered = rememberedSlot<Remembered>();

export function forgetParachuteTool(): void {
  remembered.forget();
}
