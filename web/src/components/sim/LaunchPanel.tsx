import { useMemo, useRef } from 'react';
import type { LaunchConditions, LaunchPatch } from '../../services/design/orkTree';
import { missingRequired, type RequiredLaunchKey } from '../../services/flight/requiredLaunch';
import { useUnits } from '../../prefs/useUnits';
import type { PowerClass } from '../../services/flight/powerClass';
import { type LauncherKind } from '../../services/design/launcher';
import { useLauncherT } from '../common/useLauncher';
import { LaunchRodSection } from './LaunchRodSection';
import { LaunchSiteSection } from './LaunchSiteSection';
import { AtmosphereSection } from './AtmosphereSection';
import { WindSection, type SpeedEditBase } from './WindSection';
import { EarthModelSection } from './EarthModelSection';
import type { LaunchSectionProps } from './launchSection';

export function LaunchPanel({
  launch,
  onChange,
  onCommit,
  diff,
  weather = false,
  weatherKey = false,
  launcher = null,
  powerClass = null,
}: {
  launch: LaunchConditions;
  onChange: (patch: LaunchPatch) => void;
  diff?: ReadonlySet<keyof LaunchConditions>;
  /** Number fields commit via the container blur (React blur bubbles). */
  onCommit?: () => void;
  weather?: boolean;
  weatherKey?: boolean;
  launcher?: LauncherKind | null;
  powerClass?: PowerClass | null;
}) {
  const t = useLauncherT(launcher ?? null);
  const u = useUnits();
  const blank = useMemo(() => new Set<RequiredLaunchKey>(missingRequired(launch)), [launch]);
  const speedEditBase = useRef<SpeedEditBase | null>(null);

  const section: LaunchSectionProps = {
    launch,
    onChange,
    onCommit,
    t,
    u,
    mixed: (k) => diff?.has(k) ?? false,
    req: (k) => ({ required: true, missing: blank.has(k) }),
  };

  return (
    // React's onBlur bubbles, so container blur commits any number field.
    <div
      className="space-y-4"
      onBlur={() => {
        speedEditBase.current = null;
        onCommit?.();
      }}
    >
      <LaunchRodSection {...section} powerClass={powerClass} />
      <LaunchSiteSection {...section} />
      <AtmosphereSection {...section} diff={diff} weather={weather} weatherKey={weatherKey} />
      <WindSection {...section} diff={diff} speedEditBase={speedEditBase} />
      <EarthModelSection {...section} />
    </div>
  );
}
