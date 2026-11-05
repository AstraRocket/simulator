import { useTranslation } from 'react-i18next';
import { QNum } from '../sim/QNum';
import { SiteElevationField, SiteTemperatureField } from './SiteFields';
import { CardGroup } from '../common/CardGroup';
import { NumberRow } from '../common/NumberRow';
import { FieldLabel } from '../common/FieldMark';
import { motorFullName } from '../../services/motors/motorName';
import { MAIN_BAND } from '../../services/flight/recoverySizing';
import { SIMPLE_FIN_COUNT, SIMPLE_FIN_SHAPES, type SimpleFinShape } from '../../services/flight/simpleRocket';
import type { SimpleRocket } from './useSimpleRocket';

const SECONDARY =
  'rounded-lg bg-raised px-3 py-1.5 text-xs font-medium text-ink hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50';

export function RocketCard({ rocket }: { rocket: SimpleRocket }) {
  const { t } = useTranslation();
  const { u, diameterM, setDiameterM, lengthM, setLengthM, dryMassKg, setDryMassKg } = rocket;
  const { cgM, setCgM, mountDiameterM, setMountDiameterM } = rocket;
  return (
    <CardGroup title={t('simpleTool.rocket')}>
      <QNum
        label={t('simpleTool.diameter')}
        hint={t('simpleTool.diameterHint')}
        field="simpleDiameter"
        kind="length"
        u={u}
        stepSi={0.001}
        minSi={0.005}
        maxSi={1}
        required
        missing={diameterM == null}
        value={diameterM}
        onChange={setDiameterM}
      />
      <QNum
        label={t('simpleTool.length')}
        hint={t('simpleTool.lengthHint')}
        field="simpleLength"
        kind="length"
        u={u}
        stepSi={0.01}
        minSi={0.05}
        maxSi={10}
        required
        missing={lengthM == null}
        value={lengthM}
        onChange={setLengthM}
      />
      <QNum
        label={t('simpleTool.mass')}
        hint={t('simpleTool.massHint')}
        field="simpleMass"
        kind="mass"
        u={u}
        stepSi={0.001}
        minSi={0.001}
        maxSi={1000}
        required
        missing={dryMassKg == null}
        value={dryMassKg}
        onChange={setDryMassKg}
      />
      <QNum
        label={t('simpleTool.cg')}
        hint={t('simpleTool.cgHint')}
        field="simpleCg"
        kind="length"
        u={u}
        stepSi={0.001}
        minSi={0.001}
        maxSi={lengthM ?? 10}
        required
        missing={cgM == null}
        value={cgM}
        onChange={setCgM}
      />
      <QNum
        label={t('simpleTool.mount')}
        hint={t('simpleTool.mountHint')}
        field="simpleMount"
        kind="motorDimensions"
        u={u}
        stepSi={0.001}
        minSi={0.005}
        maxSi={1}
        required
        missing={mountDiameterM == null}
        value={mountDiameterM}
        onChange={setMountDiameterM}
      />
    </CardGroup>
  );
}

export function FinsCard({ rocket }: { rocket: SimpleRocket }) {
  const { t } = useTranslation();
  const { u, lengthUnit, standIn, finCount, setFinCount, finShape, setFinShape } = rocket;
  const { finRootM, setFinRootM, finSpanM, setFinSpanM } = rocket;
  return (
    <CardGroup title={t('simpleTool.fins')}>
      <NumberRow
        label={t('simpleTool.finCount')}
        step={1}
        min={SIMPLE_FIN_COUNT.min}
        max={SIMPLE_FIN_COUNT.max}
        required
        missing={finCount == null}
        value={finCount}
        onChange={(v) => setFinCount(v == null ? null : Math.round(v))}
      />
      <label className="flex items-center justify-between gap-3">
        <FieldLabel text={t('simpleTool.finShape')} />
        <select
          value={finShape}
          onChange={(e) => setFinShape(e.target.value as SimpleFinShape)}
          className="w-32 rounded-md bg-raised px-2 py-1 text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
        >
          {SIMPLE_FIN_SHAPES.map((k) => (
            <option key={k} value={k}>
              {t(`simpleTool.finShape_${k}`)}
            </option>
          ))}
        </select>
      </label>
      <QNum
        label={t('simpleTool.finRoot')}
        hint={t('simpleTool.finRootHint')}
        field="simpleFinRoot"
        kind="length"
        u={u}
        stepSi={0.001}
        minSi={0.001}
        maxSi={5}
        placeholder={standIn ? lengthUnit('simpleFinRoot').fmt(standIn.rootChordM) : undefined}
        value={finRootM}
        onChange={setFinRootM}
      />
      <QNum
        label={t('simpleTool.finSpan')}
        hint={t('simpleTool.finSpanHint')}
        field="simpleFinSpan"
        kind="length"
        u={u}
        stepSi={0.001}
        minSi={0.001}
        maxSi={5}
        placeholder={standIn ? lengthUnit('simpleFinSpan').fmt(standIn.spanM) : undefined}
        value={finSpanM}
        onChange={setFinSpanM}
      />
      <p className="text-xs text-ink-muted">{t('simpleTool.finsNote')}</p>
    </CardGroup>
  );
}

export function MotorCard({
  rocket,
  onPick,
  onGuide,
}: {
  rocket: SimpleRocket;
  onPick: () => void;
  onGuide: () => void;
}) {
  const { t } = useTranslation();
  const { motor, shaped } = rocket;
  return (
    <CardGroup title={t('simpleTool.motor')}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink">{motor ? motorFullName(motor) : t('simpleTool.noMotor')}</span>
        <div className="flex shrink-0 gap-2">
          <button type="button" disabled={!shaped} onClick={onPick} className={SECONDARY}>
            {t('simpleTool.chooseMotor')}
          </button>
          <button
            type="button"
            disabled={!shaped}
            onClick={onGuide}
            title={t('simpleTool.guideOpenHint')}
            className={SECONDARY}
          >
            {t('guide.open')}
          </button>
        </div>
      </div>
    </CardGroup>
  );
}

export function ChuteCard({ rocket }: { rocket: SimpleRocket }) {
  const { t } = useTranslation();
  const { u, lengthUnit, chuteOn, setChuteOn, chuteDiameterM, setChuteDiameterM } = rocket;
  const { chuteCd, setChuteCd, chuteSized } = rocket;
  return (
    <CardGroup title={t('simpleTool.chute')}>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={chuteOn}
          onChange={(e) => setChuteOn(e.target.checked)}
          className="accent-accent-500"
        />
        {t('simpleTool.chuteOn')}
      </label>
      {chuteOn && (
        <>
          <QNum
            label={t('simpleTool.chuteDiameter')}
            hint={t('simpleTool.chuteDiameterHint')}
            field="simpleChuteDiameter"
            kind="length"
            u={u}
            stepSi={0.01}
            minSi={0.01}
            maxSi={20}
            placeholder={
              chuteSized != null && Number.isFinite(chuteSized)
                ? lengthUnit('simpleChuteDiameter').fmt(chuteSized)
                : undefined
            }
            value={chuteDiameterM}
            onChange={setChuteDiameterM}
          />
          <NumberRow
            label={t('chuteTool.cd')}
            step={0.05}
            min={0.05}
            max={3}
            required
            missing={chuteCd == null}
            value={chuteCd}
            onChange={setChuteCd}
          />
          <p className="text-xs text-ink-muted">
            {t('simpleTool.chuteNote', {
              rate: u.fmtSym('velocity', MAIN_BAND.target),
            })}
          </p>
        </>
      )}
    </CardGroup>
  );
}

export function LaunchCard({ rocket }: { rocket: SimpleRocket }) {
  const { t } = useTranslation();
  const { u, rodLengthM, setRodLengthM, siteM, setSiteM, temperatureC, setTemperatureC } = rocket;
  return (
    <CardGroup title={t('simpleTool.launch')}>
      <QNum
        label={t('simpleTool.rodLength')}
        field="simpleRod"
        kind="length"
        u={u}
        stepSi={0.1}
        minSi={0.1}
        maxSi={30}
        required
        missing={rodLengthM == null}
        value={rodLengthM}
        onChange={setRodLengthM}
      />
      <SiteElevationField required missing={siteM == null} value={siteM} onChange={setSiteM} />
      <SiteTemperatureField
        field="simpleTemperature"
        placeholder={t('simpleTool.standard')}
        value={temperatureC}
        onChange={setTemperatureC}
      />
    </CardGroup>
  );
}
