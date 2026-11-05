// cspell:ignore Simuleren Simulaties -- Dutch tab names, quoted as written
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { useShowResultsTab } from './useShowResultsTab';
import { taskTabs } from './tabTable';
import { useIsXl } from '../common/useMediaQuery';

// The phone word is not always shorter ("Simuleren" vs "Simulaties"), so compare lengths.
// Margins are tuned to the pixel for Dutch and Portuguese (workbench-header.spec.ts).
export function WorkbenchTabs() {
  const { t } = useTranslation();
  const tab = useWorkspaceStore((s) => s.tab);
  const onTab = useWorkspaceStore((s) => s.setTab);
  const showResults = useShowResultsTab();
  const roomy = useIsXl();
  const name = (label: string, short: string) => {
    const full = t(label);
    const brief = t(short);
    return roomy || brief.length >= full.length ? full : brief;
  };

  return (
    <nav
      aria-label={t('tabs.workbench')}
      className="-my-3 ml-1 hidden self-stretch items-stretch lg:flex xl:ml-0 2xl:ml-3 2xl:gap-1"
    >
      <TabButton active={tab === 'design'} onClick={() => onTab('design')} label={t('tabs.design')} />
      {taskTabs(showResults).map((e) => (
        <TabButton key={e.id} active={tab === e.id} onClick={() => onTab(e.id)} label={name(e.label, e.short)} />
      ))}
    </nav>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      // `-mb-px` pulls the border over the header's own.
      className={`-mb-px flex items-center border-b-2 px-1 text-sm font-semibold 2xl:px-3 ${
        active
          ? 'border-accent-500 text-accent-300'
          : 'border-transparent text-ink-muted hover:border-line/20 hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}
