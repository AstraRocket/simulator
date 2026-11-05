import { useTranslation } from 'react-i18next';
import { fmtDegrees, fmtGroundDistance, useUnits } from '../../prefs/useUnits';
import type { LandingRun } from '../../services/landing/landingEstimate';
import { QNum } from '../sim/QNum';
import { LandingMap } from '../common/map/LandingMap';
import { CardGroup } from '../common/CardGroup';
import { TermRow } from '../common/TermRow';
import { OpenMeteoCredit } from '../common/OpenMeteoCredit';
import { formatCoord } from '../../services/map/slippyMap';
import { fmtSiteTime } from '../../i18n/format';
import { RadioGroup } from '../common/RadioGroup';
import type { LandingForm } from './LandingEstimator';
import { minutesSeconds } from './minutesSeconds';

export function LandingFlightCard({ form }: { form: LandingForm }) {
  const { t } = useTranslation();
  const u = useUnits();
  const { apogee, setApogee, recovery, setRecovery, dual, firstRate, setFirstRate } = form;
  const { mainRate, setMainRate, mainAgl, setMainAgl } = form;
  return (
    <CardGroup title={t('landing.flight')}>
      <QNum
        label={t('landing.apogee')}
        field="landingApogee"
        kind="distance"
        u={u}
        stepSi={10}
        minSi={1}
        maxSi={30_000}
        required
        missing={apogee == null}
        value={apogee}
        onChange={setApogee}
      />
      <RadioGroup
        legend={t('landing.recovery')}
        options={['single', 'dual'] as const}
        value={recovery}
        onChange={setRecovery}
        fmt={(r) => t(`landing.recovery_${r}`)}
      />
      <QNum
        label={t(dual ? 'landing.drogueRate' : 'landing.descentRate')}
        field="landingFirstRate"
        kind="velocity"
        u={u}
        stepSi={0.5}
        minSi={0.1}
        maxSi={150}
        required
        missing={firstRate == null}
        value={firstRate}
        onChange={setFirstRate}
      />
      {dual && (
        <>
          <QNum
            label={t('landing.mainRate')}
            field="landingMainRate"
            kind="velocity"
            u={u}
            stepSi={0.5}
            minSi={0.1}
            maxSi={150}
            required
            missing={mainRate == null}
            value={mainRate}
            onChange={setMainRate}
          />
          <QNum
            label={t('landing.mainAltitude')}
            field="landingMainAltitude"
            kind="distance"
            u={u}
            stepSi={10}
            minSi={1}
            maxSi={30_000}
            required
            missing={mainAgl == null}
            hint={mainAgl != null && apogee != null && mainAgl >= apogee ? t('landing.mainAboveApogee') : undefined}
            value={mainAgl}
            onChange={setMainAgl}
          />
        </>
      )}
    </CardGroup>
  );
}

export function LandingResult({
  run,
  estimate: e,
  latitudeDeg,
  longitudeDeg,
  outdated,
}: {
  run: LandingRun;
  estimate: NonNullable<LandingRun['estimate']>;
  latitudeDeg: number;
  longitudeDeg: number;
  outdated: boolean;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const dist = u.plain('distance');
  const fmtM = (m: number) => fmtGroundDistance(dist, m);
  const validTime = fmtSiteTime(run.validUnix * 1000, run.answer.timezone);
  return (
    <>
      {outdated && <p className="text-xs text-warn-400">{t('landing.outdated')}</p>}
      <LandingMap
        latitudeDeg={latitudeDeg}
        longitudeDeg={longitudeDeg}
        path={e.nominal.path}
        landing={e.nominal.landing}
        samples={e.samples}
        ellipse={e.ellipse}
        distanceUnit={dist}
      />
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-2 rounded-xl bg-surface p-3 text-xs ring-1 ring-line/10">
        <TermRow label={t('landing.lands')}>{formatCoord(e.nominal.landingLatDeg, e.nominal.landingLonDeg, 5)}</TermRow>
        <TermRow label={t('landing.distance')}>{fmtM(e.nominal.distanceM)}</TermRow>
        <TermRow label={t('landing.bearing')}>{fmtDegrees(u, e.nominal.bearingDeg)}</TermRow>
        <TermRow label={t('landing.descentTime')}>{minutesSeconds(e.nominal.timeS)}</TermRow>
        <TermRow label={t('landing.zone')}>
          {e.ellipse ? `${fmtM(2 * e.ellipse.semiMajorM)} × ${fmtM(2 * e.ellipse.semiMinorM)}` : t('landing.noZone')}
        </TermRow>
        <TermRow label={t('landing.groundAtLanding')}>{fmtM(e.nominal.groundElevationM)}</TermRow>
        <TermRow label={t('env.when')}>{validTime}</TermRow>
      </dl>
      <p className="text-xs text-ink-muted">
        {t('landing.estimateNote', { descents: e.samples.length, hours: e.hours })}
      </p>
      {!run.terrain && <p className="text-xs text-warn-400">{t('landing.flatGround')}</p>}
      {run.answer.endpoint === 'archive' && <p className="text-xs text-warn-400">{t('landing.surfaceWindOnly')}</p>}
      <OpenMeteoCredit />
    </>
  );
}
