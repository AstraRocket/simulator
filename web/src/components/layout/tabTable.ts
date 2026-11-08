import type { Tab } from '../../state/tabs';

interface TabEntry {
  id: Tab;
  label: string;
  short: string;
  icon: string;
}

const TASK_TABS: readonly TabEntry[] = [
  { id: 'configs', label: 'tabs.configs', short: 'tabs.configsShort', icon: '🔥' },
  { id: 'sim', label: 'tabs.simulations', short: 'tabs.simulate', icon: '📈' },
  { id: 'results', label: 'tabs.results', short: 'tabs.results', icon: '📊' },
  { id: 'simple', label: 'tabs.simple', short: 'tabs.simple', icon: '🚀' },
  { id: 'tools', label: 'tabs.tools', short: 'tabs.tools', icon: '🧰' },
];

export const taskTabs = (showResults: boolean): readonly TabEntry[] =>
  showResults ? TASK_TABS : TASK_TABS.filter((e) => e.id !== 'results');
