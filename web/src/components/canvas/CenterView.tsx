import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore, selectDesignName, selectShownSim } from '../../state/store';
import { confirm } from '../../state/confirmStore';
import { useSettings } from '../../state/SettingsProvider';
import { StabilityBadge } from './StabilityBadge';
import { RocketOverview } from './RocketOverview';
import { DesignWarnings } from './DesignWarnings';
import { LoadedBanner } from './LoadedBanner';
import { CenterToolbar } from './CenterToolbar';
import { CenterCanvas } from './CenterCanvas';
import { FlightEventsTable } from '../sim/FlightEventsTable';
import { SimSummary } from '../sim/SimSummary';
import { useIsDesktop } from '../common/useMediaQuery';
import { FlightWarnings } from '../sim/FlightWarnings';
import { RecoveryChargesCard } from '../sim/RecoveryChargesCard';
import { useResultFlight } from './useResultFlight';
import { useRecoveryMass } from './useRecoveryMass';
import { useMaximizeCenter } from './useMaximizeCenter';
import { useAutoRunOutdated } from './useAutoRunOutdated';

export function CenterView() {
  const { t } = useTranslation();
  const tab = useWorkspaceStore((s) => s.tab);
  const designPane = useWorkspaceStore((s) => s.designPane);
  // Flight warnings render once: here on a phone, in the Results column at lg+ (App.tsx).
  const desktop = useIsDesktop();
  const loadedMeta = useWorkspaceStore((s) => s.loadedMeta);
  const leaveForNew = useWorkspaceStore((s) => s.leaveForNew);
  const onCloseLoaded = async () => {
    if (await confirm({ message: t('banner.closeConfirm'), confirmLabel: t('banner.close') })) {
      await leaveForNew();
    }
  };
  const view = useWorkspaceStore((s) => s.view);
  const info = useWorkspaceStore((s) => s.info);
  const result = useWorkspaceStore((s) => selectShownSim(s).result ?? null);
  const designName = useWorkspaceStore(selectDesignName);
  const simName = useWorkspaceStore((s) => selectShownSim(s).name);
  const { flight, pathResult } = useResultFlight();
  const { recoveryWeight, recoveryEstimated } = useRecoveryMass();
  const { settings, update } = useSettings();
  const { maxed, toggleMaxed } = useMaximizeCenter();
  useAutoRunOutdated();

  const [ctrlSlot, setCtrlSlot] = useState<HTMLDivElement | null>(null);
  const [presetSlot, setPresetSlot] = useState<HTMLDivElement | null>(null);
  // Turned a quarter turn on a portrait phone.
  const sideways = view === '2d' || view === '3d' || view === 'drag';
  // At lg+ `designPane` is ignored (the `lg:` overrides below).
  const onDesign = tab === 'design';
  const showStats = onDesign && designPane === 'stats';
  const showDrawing = (onDesign && designPane === 'sketch') || tab === 'results';
  const pageScroll = tab === 'results' && !desktop;

  return (
    <div className={`flex h-full flex-col ${pageScroll ? 'relative overflow-y-auto' : ''}`}>
      <div className={`${showStats ? '' : 'hidden'} shrink-0 ${onDesign ? 'lg:block' : ''}`}>
        <LoadedBanner loaded={loadedMeta} onClose={onCloseLoaded} />
      </div>
      {tab === 'results' && (
        // `relative` so the CSV button's sr-only label scrolls with this block instead of stretching the page.
        <div className="relative shrink-0 space-y-3 px-3 pt-3 lg:hidden">
          {!desktop && <FlightWarnings sim={result} />}
          <SimSummary sim={result} />
          <FlightEventsTable sim={result} simName={simName} designName={designName} />
          {!desktop && <RecoveryChargesCard />}
        </div>
      )}
      <div
        className={`${showDrawing ? 'flex' : 'hidden'} ${sideways ? 'sketch-stage' : ''} ${
          // A floor for the map and 3D views, which fill what they are given.
          pageScroll ? 'min-h-[75dvh] shrink-0' : 'min-h-0 flex-1'
        } w-full flex-col overflow-hidden lg:flex`}
      >
        <div className={sideways ? 'sketch-rotate flex flex-col' : 'flex min-h-0 flex-1 flex-col'}>
          <CenterToolbar
            resultName={simName}
            onCtrlSlot={setCtrlSlot}
            onPresetSlot={setPresetSlot}
            maxed={maxed}
            onToggleMaxed={toggleMaxed}
          />
          <CenterCanvas
            flight={flight}
            pathResult={pathResult}
            ctrlSlot={ctrlSlot}
            presetSlot={presetSlot}
            flow={pageScroll}
          />
        </div>
      </div>
      <div
        className={`${showStats ? '' : 'hidden'} min-h-0 flex-1 overflow-y-auto lg:flex-none lg:overflow-visible ${
          onDesign && !maxed ? 'lg:block' : ''
        } ${maxed ? 'lg:hidden' : ''}`}
      >
        <DesignWarnings />
        {!desktop && info && <RocketOverview info={info} />}
        <StabilityBadge
          info={info}
          recoveryWeight={recoveryWeight}
          recoveryEstimated={recoveryEstimated}
          expanded={settings.showStats}
          onToggle={() => update({ showStats: !settings.showStats })}
        />
      </div>
    </div>
  );
}
