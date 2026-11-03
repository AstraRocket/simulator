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

/**
 * Launch & atmosphere conditions for the flight simulation: launch rod, launch
 * site, base atmosphere, wind (single average or an altitude-layered multilevel
 * profile), and the Earth (geodetic) model, one card each. Emits a shallow
 * patch on change; the owner (the simulation editor or the launch defaults tab)
 * merges it into the conditions it holds.
 */
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
  /**
   * Applied to every simulation being edited. A value worked out from the
   * conditions (a deviation recomputed to the new speed, a profile seeded from the
   * wind) goes as a function, so each simulation works it out from its own.
   */
  onChange: (patch: LaunchPatch) => void;
  /**
   * Launch keys the simulations being edited together disagree on, marked so a
   * bulk edit cannot flatten a value off screen. Empty/absent for the ordinary
   * single-simulation case and for the Settings copy, which edits one default.
   */
  diff?: ReadonlySet<keyof LaunchConditions>;
  /** Close the current edit's undo entry. Number fields commit via the panel's
   *  container blur (React blur bubbles); discrete controls commit immediately. */
  onCommit?: () => void;
  /**
   * Offer the Weather dialog. The simulation editor does; the Settings copy,
   * which edits the defaults every future simulation starts from, does not: a
   * forecast is for one day at one site.
   */
  weather?: boolean;
  /**
   * Offer the Open-Meteo API key, at the bottom of the Atmosphere card. Only the
   * Settings copy does: the key is one setting for every simulation.
   */
  weatherKey?: boolean;
  /** What the design is launched from, which names the launcher fields; null for the neutral word. */
  launcher?: LauncherKind | null;
  /**
   * The class of rocket these conditions fly, which sets the launcher angle the
   * codes allow. Null when there is no one answer: the Settings copy edits the
   * defaults for every configuration, and a bulk edit can span both classes.
   * The field then stops at the model rocket limit and the hint states both.
   */
  powerClass?: PowerClass | null;
}) {
  const t = useLauncherT(launcher ?? null);
  const u = useUnits();
  // Empty required fields on the simulation being shown. The Settings copy of
  // this panel never has any: it fills blanks from the previous default,
  // because a blank default would hand every future simulation a hole.
  const blank = useMemo(() => new Set<RequiredLaunchKey>(missingRequired(launch)), [launch]);
  // The winds the wind speed box's current edit started from (see WindSection).
  // Cleared on blur, which ends the edit.
  const speedEditBase = useRef<SpeedEditBase | null>(null);

  const section: LaunchSectionProps = {
    launch,
    onChange,
    onCommit,
    t,
    u,
    mixed: (k) => diff?.has(k) ?? false,
    /** The fields shown are required; `missing` is the ones currently empty. */
    req: (k) => ({ required: true, missing: blank.has(k) }),
  };

  return (
    // Container blur closes the undo entry for whichever number field was being
    // edited (React's onBlur bubbles from the focused input).
    // No padding of its own: every caller already sits in a padded column (the
    // sim editor, the Settings dialog body), and a second p-3 would inset this
    // panel's cards relative to their siblings. The gap matches the sim
    // editor's, so one column of cards reads as one rhythm.
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
