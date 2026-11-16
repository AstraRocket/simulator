import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { useShowResultsTab } from './useShowResultsTab';
import { taskTabs } from './tabTable';
import { LOGO_URL } from '../../services/app/appInfo';

/** The bottom padding is the home-indicator inset, needed because `index.html` sets `viewport-fit=cover`. */
export function TabBar() {
  const { t } = useTranslation();
  const tab = useWorkspaceStore((s) => s.tab);
  const pane = useWorkspaceStore((s) => s.designPane);
  const onTab = useWorkspaceStore((s) => s.setTab);
  const onPane = useWorkspaceStore((s) => s.setDesignPane);
  const showResults = useShowResultsTab();
  return (
    <nav
      aria-label={t('tabs.workbench')}
      className="flex shrink-0 border-t border-line/10 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <TabButton
        active={tab === 'design' && pane === 'stats'}
        onClick={() => onPane('stats')}
        label={t('tabs.rocket')}
        icon={<img src={LOGO_URL} alt="" className="h-5 w-5" />}
      />
      <TabButton
        active={tab === 'design' && pane === 'sketch'}
        onClick={() => onPane('sketch')}
        label={t('tabs.sketch')}
        icon="📐"
      />
      {taskTabs(showResults).map((e) => (
        <TabButton key={e.id} active={tab === e.id} onClick={() => onTab(e.id)} label={t(e.short)} icon={e.icon} />
      ))}
    </nav>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-1 flex-col items-center gap-0.5 border-t-2 py-3 text-xs ${
        active ? 'border-accent-400 font-semibold text-accent-400' : 'border-transparent text-ink-muted'
      }`}
    >
      <span className="text-lg" aria-hidden="true">
        {icon}
      </span>
      {label}
    </button>
  );
}
