import { useState } from 'react';
import { CardGroup } from '../common/CardGroup';
import { RadioGroup } from '../common/RadioGroup';
import { fmtDegrees } from '../../prefs/useUnits';
import { NORTH_REFERENCES, siteDeclination, type NorthReference } from '../../services/flight/bearing';
import type { LaunchConditions } from '../../services/design/orkTree';
import type { LaunchSectionProps } from './launchSection';
import { CompassFigure } from './CompassFigure';
import { PadDialog } from './PadDialog';
import { graphics3d } from '../../services/app/graphics';

// What the drawing reads; any of them differing across the selection makes it one simulation's picture.
const FIGURE_KEYS: readonly (keyof LaunchConditions)[] = [
  'launchRodDirectionDeg',
  'launchRodAngleDeg',
  'launchIntoWind',
  'windAverage',
  'windDirectionDeg',
  'windLevels',
];

/** Which north the bearing fields are typed against, and the site's declination between the two. */
export function CompassSection({
  launch,
  t,
  u,
  mixed,
  pref,
  onPref,
}: Pick<LaunchSectionProps, 'launch' | 't' | 'u' | 'mixed'> & {
  pref: NorthReference;
  onPref: (r: NorthReference) => void;
}) {
  const [padOpen, setPadOpen] = useState(false);
  const declination = siteDeclination(launch);
  const note = (() => {
    if (mixed('latitudeDeg') || mixed('longitudeDeg')) return t('launch.declinationMixed');
    if (declination === null) return t('launch.declinationNeedsSite');
    const angle = fmtDegrees(u, Math.abs(declination), 1);
    return t(declination >= 0 ? 'launch.declinationEast' : 'launch.declinationWest', { angle });
  })();
  return (
    <CardGroup title={t('launch.compass')}>
      <RadioGroup
        legend={t('launch.north')}
        options={NORTH_REFERENCES}
        value={pref}
        onChange={onPref}
        fmt={(r) => t(`launch.north_${r}`)}
      />
      <p className="text-[11px] leading-snug text-ink-faint">{note}</p>
      <CompassFigure launch={launch} t={t} u={u} declination={pref === 'magnetic' ? declination : null} />
      {FIGURE_KEYS.some(mixed) && <p className="text-[11px] leading-snug text-ink-faint">{t('launch.figMixed')}</p>}
      {!graphics3d().reason && (
        <button
          onClick={() => setPadOpen(true)}
          className="w-full rounded-md bg-raised py-1.5 text-xs font-medium text-accent-300 ring-1 ring-line/10 hover:bg-elevated"
        >
          {t('launch.viewPad3d')}
        </button>
      )}
      {padOpen && <PadDialog launch={launch} onClose={() => setPadOpen(false)} />}
    </CardGroup>
  );
}
