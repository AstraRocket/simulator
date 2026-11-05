import { must } from '../../services/app/must';
import { useState, type ReactNode } from 'react';
import { useTabs } from '../common/useTabs';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../state/useSettings';
import { DEFAULT_SETTINGS } from '../../services/storage/settings';
import { Dialog } from '../common/Dialog';
import { DialogButton } from '../common/DialogButton';
import { confirm } from '../../state/confirmStore';
import { fireAction } from '../../state/fireAction';
import type { SettingsTab } from './dialogKeys';
import {
  ColorsTab,
  GeneralTab,
  LaunchTab,
  MaterialsTab,
  PlaybackTab,
  SimTab,
  SketchTab,
  UnitsTab,
} from './SettingsTabs';
import { FlyerTab } from './FlyerTab';

const TABS: { key: SettingsTab; label: string }[] = [
  { key: 'general', label: 'settings.tabGeneral' },
  { key: 'units', label: 'settings.tabUnits' },
  { key: 'colors', label: 'settings.tabColors' },
  { key: 'materials', label: 'settings.tabMaterials' },
  { key: 'playback', label: 'settings.tabPlayback' },
  { key: 'sketch', label: 'settings.tabSketch' },
  { key: 'sim', label: 'settings.tabSim' },
  { key: 'launch', label: 'settings.tabLaunch' },
  { key: 'flyer', label: 'settings.tabFlyer' },
];

const TAB_BODY: Record<SettingsTab, ReactNode> = {
  general: <GeneralTab />,
  units: <UnitsTab />,
  colors: <ColorsTab />,
  materials: <MaterialsTab />,
  playback: <PlaybackTab />,
  sketch: <SketchTab />,
  sim: <SimTab />,
  launch: <LaunchTab />,
  flyer: <FlyerTab />,
};

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { update, reset } = useSettings();
  const [tab, setTab] = useState<SettingsTab>('general');
  const tabs = useTabs(
    TABS.map((x) => x.key),
    tab,
    setTab,
  );
  const resetAll = async () => {
    const ok = await confirm({
      message: t('settings.resetAllConfirm'),
      confirmLabel: t('settings.resetAll'),
      danger: true,
    });
    if (ok) reset();
  };

  const tabName = t(
    must(
      TABS.find((x) => x.key === tab),
      'settings tab',
    ).label,
  );
  const resetSection = async () => {
    if (tab === 'launch' || tab === 'materials' || tab === 'flyer') {
      const ok = await confirm({
        message: t('settings.resetTabConfirm', { name: tabName }),
        confirmLabel: t('settings.resetTab', { name: tabName }),
        danger: true,
      });
      if (!ok) return;
    }
    if (tab === 'general')
      update({
        saveDesignInfo: DEFAULT_SETTINGS.saveDesignInfo,
        askWhereToSave: DEFAULT_SETTINGS.askWhereToSave,
        theme: DEFAULT_SETTINGS.theme,
        themeBeforeDaylight: DEFAULT_SETTINGS.themeBeforeDaylight,
        headerSummary: DEFAULT_SETTINGS.headerSummary,
        statsLayout: DEFAULT_SETTINGS.statsLayout,
      });
    else if (tab === 'units') update({ units: DEFAULT_SETTINGS.units, unitOverrides: {} });
    else if (tab === 'colors')
      update({
        partColors: {},
        figureStyles: {},
        phaseColors: DEFAULT_SETTINGS.phaseColors,
        aeroHeat: DEFAULT_SETTINGS.aeroHeat,
      });
    else if (tab === 'materials') update({ defaultMaterials: DEFAULT_SETTINGS.defaultMaterials });
    else if (tab === 'playback') update({ playbackSpeed: DEFAULT_SETTINGS.playbackSpeed });
    else if (tab === 'sketch') update({ showMarkers: DEFAULT_SETTINGS.showMarkers, rulers: DEFAULT_SETTINGS.rulers });
    else if (tab === 'sim') update({ simulation: DEFAULT_SETTINGS.simulation });
    else if (tab === 'flyer') update({ flyer: DEFAULT_SETTINGS.flyer });
    else update({ launchDefaults: DEFAULT_SETTINGS.launchDefaults });
  };

  return (
    <Dialog
      id="settings"
      title={t('settings.title')}
      onClose={onClose}
      size="lg"
      height={560}
      toolbar={
        <div role="tablist" aria-label={t('settings.title')} className="flex flex-wrap gap-1 p-3">
          {TABS.map((tb) => (
            <button
              key={tb.key}
              {...tabs.tab(tb.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${tab === tb.key ? 'bg-accent-600 text-on-accent' : 'bg-raised text-ink-soft hover:bg-elevated'}`}
            >
              {t(tb.label)}
            </button>
          ))}
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-2 p-4">
          <div className="flex gap-2">
            <button
              onClick={() => fireAction(resetSection())}
              className="rounded-lg bg-raised px-3 py-2 text-xs font-medium text-ink-soft ring-1 ring-line/10 hover:bg-elevated"
            >
              {t('settings.resetTab', { name: tabName })}
            </button>
            <button
              onClick={() => fireAction(resetAll())}
              className="rounded-lg bg-raised px-3 py-2 text-xs font-medium text-ink-soft ring-1 ring-line/10 hover:bg-elevated"
            >
              {t('settings.resetAll')}
            </button>
          </div>
          <DialogButton onClick={onClose} variant="primary">
            {t('settings.close')}
          </DialogButton>
        </div>
      }
    >
      <div {...tabs.panel} className="space-y-2 p-4">
        {TAB_BODY[tab]}
      </div>
    </Dialog>
  );
}
