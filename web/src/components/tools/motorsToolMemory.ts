import type { MotorDashboardSlots } from '../sim/MotorDashboard';
import { rememberedSlot } from './remembered';

export const slots: MotorDashboardSlots = {
  filter: rememberedSlot(),
  sort: rememberedSlot(),
  view: rememberedSlot(),
};

export function forgetMotorsTool(): void {
  slots.filter.forget();
  slots.sort.forget();
  slots.view.forget();
}
