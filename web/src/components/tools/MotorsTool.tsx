import { useTranslation } from 'react-i18next';
import { MotorDashboardView } from '../sim/MotorDashboard';
import { slots } from './motorsToolMemory';

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
