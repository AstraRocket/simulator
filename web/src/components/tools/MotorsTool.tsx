import { useTranslation } from 'react-i18next';
import { MotorDashboardView, type MotorDashboardSlots } from '../sim/MotorDashboard';
import { rememberedSlot } from './remembered';

const slots: MotorDashboardSlots = {
  filter: rememberedSlot(),
  sort: rememberedSlot(),
  view: rememberedSlot(),
};

export function forgetMotorsTool(): void {
  slots.filter.forget();
  slots.sort.forget();
  slots.view.forget();
}

export function MotorsTool() {
  const { t } = useTranslation();
  return (
    <MotorDashboardView
      slots={slots}
      frame={(actions, panes) => (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line/10 px-3 py-2">
            <h2 className="mr-auto text-sm font-semibold text-ink">{t('dash.title')}</h2>
            {actions}
          </div>
          {panes}
        </>
      )}
    />
  );
}
