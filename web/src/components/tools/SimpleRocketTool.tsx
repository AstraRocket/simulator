import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rememberedSlot, useRemembered } from './remembered';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { useSettings } from '../../state/SettingsProvider';
import { LAUNCH_SI } from '../../prefs/launchUnits';
import { LAUNCH_SITE_LIMITS } from '../../services/storage/launchLocationStore';
import { QNum } from '../sim/LaunchPanel';
import { SiteElevationField } from './SiteFields';
import { CardGroup } from '../common/CardGroup';
import { NO_VALUE } from '../../i18n/noValue';
import { NumberRow } from '../common/NumberRow';
import { FieldLabel } from '../common/FieldMark';
import { useWorkspaceStore } from '../../state/store';
import { fireAction } from '../../state/fireAction';
import { SimpleMotorGuide } from './SimpleMotorGuide';
import { flySimple, simpleKey } from './simpleFlight';
import { ToolLayout, ToolForm, ToolResultCard } from './ToolLayout';
import { SimpleHelp } from './SimpleHelp';
import { MotorDialog, findSeated } from '../sim/MotorDialog';
import type { MotorSpec } from '../../engine/openRocketEngine';
import { loadCatalog } from '../../services/motors/motorDb';
import { motorFullName } from '../../services/motors/motorName';
import { nearestDelay } from '../../services/flight/motorGuide';
import { canopyRoundUp, MAIN_BAND } from '../../services/flight/recoverySizing';
import { errorText } from '../../i18n/keyedError';
import { fmtNum, withUnit } from '../../i18n/format';
import {
  SIMPLE_FIN_COUNT,
  SIMPLE_FIN_SHAPES,
  SIMPLE_MACH_CAUTION,
  SIMPLE_NOSE_CALIBERS,
  SIMPLE_STABILITY_MIN,
  SIMPLE_CHUTE_CD,
  simpleChuteDiameter,
  simpleBodyLength,
  simpleConfig,
  simpleFins,
  simpleMountFit,
  simpleProblem,
  simpleRocketTree,
  type SimpleFigures,
  type SimpleFinShape,
  type SimpleGuide,
  type SimpleInputs,
} from '../../services/flight/simpleRocket';

/**
 * The simple rocket: size, mass and a motor, flown straight up in calm air
 * through the real kernel (services/flight/simpleRocket). For a rocket with no
 * design, the question thrustcurve.org's Motor Guide answers, without asking
 * for a drag coefficient nobody has.
 */

interface Remembered {
  diameterM: number | null;
  lengthM: number | null;
  dryMassKg: number | null;
  mountDiameterM: number | null;
  cgM: number | null;
  rodLengthM: number | null;
  siteM: number | null;
  temperatureC: number | null;
  finCount: number | null;
  finShape: SimpleFinShape;
  finRootM: number | null;
  finSpanM: number | null;
  chuteOn: boolean;
  /** Null to size it (`simpleChuteDiameter`). */
  chuteDiameterM: number | null;
  chuteCd: number | null;
  motor: MotorSpec | null;
  flown: Flown | null;
  guide: SimpleGuide | null;
}
const remembered = rememberedSlot<Remembered>();

/** A secondary button, as the motor card's Change is drawn. */
const SECONDARY =
  'rounded-lg bg-raised px-3 py-1.5 text-xs font-medium text-ink hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50';

/** An inline notice, as the Run button words one. */
const NOTICE = 'rounded-lg px-3 py-1.5 text-xs leading-snug ring-1';

/** Clears the remembered inputs, so each test starts from the defaults. */
export function forgetSimpleRocketTool(): void {
  remembered.forget();
}

/** One flight and what it was flown from, so an edit after it reads as stale. */
interface Flown {
  figures: SimpleFigures;
  /** The motor's nearest offered delay to the ideal one; null when it offers none. */
  nearest: number | null;
  key: string;
}

export function SimpleRocketTool() {
  const { t } = useTranslation();
  const u = useUnits();
  const { settings } = useSettings();
  const [diameterM, setDiameterM] = useRemembered(remembered, 'diameterM', null);
  const [lengthM, setLengthM] = useRemembered(remembered, 'lengthM', null);
  const [dryMassKg, setDryMassKg] = useRemembered(remembered, 'dryMassKg', null);
  const [mountDiameterM, setMountDiameterM] = useRemembered(remembered, 'mountDiameterM', null);
  const [cgM, setCgM] = useRemembered(remembered, 'cgM', null);
  const [rodLengthM, setRodLengthM] = useRemembered(remembered, 'rodLengthM', 1);
  const [siteM, setSiteM] = useRemembered(remembered, 'siteM', 0);
  const [temperatureC, setTemperatureC] = useRemembered(remembered, 'temperatureC', null);
  const [finCount, setFinCount] = useRemembered(remembered, 'finCount', 3);
  const [finShape, setFinShape] = useRemembered(remembered, 'finShape', 'trapezoid');
  const [finRootM, setFinRootM] = useRemembered(remembered, 'finRootM', null);
  const [finSpanM, setFinSpanM] = useRemembered(remembered, 'finSpanM', null);
  const [chuteOn, setChuteOn] = useRemembered(remembered, 'chuteOn', false);
  const [chuteDiameterM, setChuteDiameterM] = useRemembered(remembered, 'chuteDiameterM', null);
  const [chuteCd, setChuteCd] = useRemembered(remembered, 'chuteCd', SIMPLE_CHUTE_CD);
  const [motor, setMotor] = useRemembered(remembered, 'motor', null);
  const [flown, setFlown] = useRemembered(remembered, 'flown', null);
  const [guide, setGuide] = useRemembered(remembered, 'guide', null);
  const openNewDesign = useWorkspaceStore((s) => s.openNewDesign);
  const [picking, setPicking] = useState(false);
  const [guiding, setGuiding] = useState(false);
  const [flying, setFlying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const launch = { rodLengthM: rodLengthM ?? 1, launchAltitudeM: siteM ?? 0, temperatureC };
  const lengthUnit = (field: string) => u.at(unitScope('launch', field), 'length');
  // A blank canopy is sized for the main band with the chosen motor's casing,
  // rounded up to a size you can buy and shown in the box; the guide flies that one canopy on every motor.
  const chuteSized =
    dryMassKg != null && chuteCd != null
      ? canopyRoundUp(simpleChuteDiameter(dryMassKg, motor, launch, chuteCd), lengthUnit('simpleChuteDiameter'))
      : null;
  const chuteDiameter = chuteDiameterM ?? chuteSized;
  const chute = chuteOn && chuteCd != null && chuteDiameter != null ? { diameterM: chuteDiameter, cd: chuteCd } : null;
  const inputs: SimpleInputs | null =
    diameterM != null &&
    lengthM != null &&
    dryMassKg != null &&
    mountDiameterM != null &&
    cgM != null &&
    (!chuteOn || chute != null)
      ? {
          diameterM,
          lengthM,
          dryMassKg,
          mountDiameterM,
          fins: { count: finCount ?? 3, shape: finShape, rootChordM: finRootM, spanM: finSpanM },
          cgM,
          chute,
        }
      : null;
  const problem = inputs && simpleProblem(inputs);
  const key = simpleKey(inputs, launch, motor);
  const shaped = inputs != null && !problem;
  const ready = shaped && motor != null;
  // What a blank fin field flies with, shown in the box so it is not a mystery.
  const standIn = diameterM != null ? simpleFins({ diameterM }) : null;

  // While a flight is up the run button is its Cancel, as on the Simulations
  // page, so a flight that hangs has something to press.
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const fly = async () => {
    if (!ready) return;
    const ac = new AbortController();
    abort.current = ac;
    setFlying(true);
    setErr(null);
    try {
      const figures = await flySimple(inputs, launch, motor, ac.signal);
      // The delays the motor is sold with are the catalog's, not the spec's.
      const row = findSeated(await loadCatalog(), motor);
      if (!ac.signal.aborted) setFlown({ figures, nearest: row ? nearestDelay(row, figures.optimumDelay) : null, key });
    } catch (e) {
      if (!ac.signal.aborted) setErr(errorText(e, t));
    } finally {
      if (abort.current === ac) {
        abort.current = null;
        setFlying(false);
      }
    }
  };
  const cancel = () => {
    abort.current?.abort();
    abort.current = null;
    setFlying(false);
  };

  const seconds = (v: number | null) => (v == null ? null : withUnit(fmtNum(v, 1), t('units.second')));
  const fig = flown?.figures;

  return (
    <ToolLayout help>
      <ToolForm title={t('simpleTool.title')} intro={t('simpleTool.intro')}>
        <SimpleHelp at="top" />
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
            // Clamped to the rocket: a balance point past the tail is a typo.
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
        <CardGroup title={t('simpleTool.motor')}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink">{motor ? motorFullName(motor) : t('simpleTool.noMotor')}</span>
            <div className="flex shrink-0 gap-2">
              <button type="button" disabled={!shaped} onClick={() => setPicking(true)} className={SECONDARY}>
                {t('simpleTool.chooseMotor')}
              </button>
              <button
                type="button"
                disabled={!shaped}
                onClick={() => setGuiding(true)}
                title={t('simpleTool.guideOpenHint')}
                className={SECONDARY}
              >
                {t('guide.open')}
              </button>
            </div>
          </div>
        </CardGroup>
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
          <QNum
            label={t('launch.temperature')}
            field="simpleTemperature"
            kind="degC"
            u={u}
            stepSi={1}
            minSi={LAUNCH_SI.degC.toSi(LAUNCH_SITE_LIMITS.temperatureC.min)}
            maxSi={LAUNCH_SI.degC.toSi(LAUNCH_SITE_LIMITS.temperatureC.max)}
            placeholder={t('simpleTool.standard')}
            value={temperatureC}
            onChange={setTemperatureC}
          />
        </CardGroup>
      </ToolForm>
      {/* The actions head the result column, over what they produce, so neither
          sits below a form that runs off the bottom of the screen. The problem
          that holds them back is said right beside them. */}
      <div className="h-fit space-y-3">
        {problem && (
          <p role="status" className={`${NOTICE} bg-warn-500/10 text-warn-300 ring-warn-400/30`}>
            {problem === 'tooShort'
              ? t('simpleTool.tooShort', {
                  nose: SIMPLE_NOSE_CALIBERS,
                  length: lengthUnit('simpleLength').fmtSym(diameterM! * SIMPLE_NOSE_CALIBERS),
                })
              : problem === 'finsTooLong'
                ? t('simpleTool.finsTooLong', {
                    fin: lengthUnit('simpleFinRoot').fmtSym(simpleFins(inputs).rootChordM),
                    body: lengthUnit('simpleLength').fmtSym(simpleBodyLength(inputs)),
                  })
                : problem === 'cgOutside'
                  ? t('simpleTool.cgOutside', { length: lengthUnit('simpleLength').fmtSym(lengthM!) })
                  : t('simpleTool.mountTooWide', {
                      mount: u.at(unitScope('launch', 'simpleMount'), 'motorDimensions').fmtSym(mountDiameterM!),
                      body: u.at(unitScope('launch', 'simpleDiameter'), 'length').fmtSym(diameterM!),
                    })}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!flying && !ready}
            onClick={flying ? cancel : () => void fly()}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-50 ${
              flying ? 'bg-prominent hover:bg-prominent-hover' : 'bg-accent-600 hover:bg-accent-700'
            }`}
          >
            {flying ? t('sim.cancel') : t('sim.run')}
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() =>
              ready &&
              fireAction(
                openNewDesign(simpleRocketTree(inputs, motor), simpleConfig(motor), {
                  launchRodLengthM: launch.rodLengthM,
                  launchAltitudeM: launch.launchAltitudeM,
                  temperatureC: launch.temperatureC,
                }),
              )
            }
            title={t('simpleTool.openDesignHint')}
            className="shrink-0 rounded-lg bg-raised px-4 py-2.5 text-sm font-semibold text-ink ring-1 ring-line/10 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('simpleTool.openDesign')}
          </button>
        </div>
        <ToolResultCard label={t('simpleTool.result')}>
          {err && (
            <p role="alert" className={`${NOTICE} mb-3 bg-danger-500/10 text-danger-300 ring-danger-400/30`}>
              {err}
            </p>
          )}
          {!fig ? (
            <p className="text-xs text-ink-muted">{t('simpleTool.empty')}</p>
          ) : (
            <div className="space-y-4">
              {flown.key !== key && <p className="text-xs text-warn-400">{t('simpleTool.stale')}</p>}
              <Figures title={t('simpleTool.solid')}>
                <Figure
                  label={t('simpleTool.railExit')}
                  value={u.fmtSym('velocity', fig.railExit)}
                  warn={
                    fig.railExit < settings.simulation.railExitVelocityMin
                      ? t('simpleTool.slowExit', {
                          speed: u.fmtSym('velocity', settings.simulation.railExitVelocityMin),
                        })
                      : null
                  }
                />
                <Figure label={t('simpleTool.railTwr')} value={fig.railTwr == null ? null : fmtNum(fig.railTwr, 1)} />
                <Figure label={t('sim.maxAccel')} value={u.fmtSym('acceleration', fig.maxAcceleration)} />
                <Figure label={t('simpleTool.burnout')} value={seconds(fig.burnoutTime)} />
              </Figures>
              <Figures title={t('simpleTool.estimate')} note={t('simpleTool.estimateNote')}>
                <Figure label={t('sim.apogee')} value={u.fmtSym('distance', fig.apogee)} />
                <Figure
                  label={t('simpleTool.burnoutAltitude')}
                  value={fig.burnoutAltitude == null ? null : u.fmtSym('distance', fig.burnoutAltitude)}
                />
                <Figure label={t('sim.maxSpeed')} value={u.fmtSym('velocity', fig.maxVelocity)} />
                <Figure
                  label={t('sim.maxMach')}
                  value={fmtNum(fig.maxMach, 2)}
                  warn={
                    fig.maxMach > SIMPLE_MACH_CAUTION ? t('simpleTool.machNote', { mach: SIMPLE_MACH_CAUTION }) : null
                  }
                />
                <Figure label={t('simpleTool.toApogee')} value={seconds(fig.timeToApogee)} />
                <Figure label={t('simpleTool.optimumDelay')} value={seconds(fig.optimumDelay)} />
                {flown.nearest != null && (
                  <Figure label={t('simpleTool.nearestDelay')} value={seconds(flown.nearest)} />
                )}
                {fig.railStability != null && (
                  <Figure
                    label={t('simpleTool.railStability')}
                    value={t('simpleTool.calibers', { value: fmtNum(fig.railStability, 2) })}
                    warn={
                      fig.railStability < SIMPLE_STABILITY_MIN
                        ? t('simpleTool.lowStability', { min: SIMPLE_STABILITY_MIN })
                        : null
                    }
                  />
                )}
              </Figures>
              {/* Absent from a flight with no parachute, and from one flown before the card existed. */}
              {fig.landingVelocity != null && (
                <Figures title={t('simpleTool.underChute')}>
                  <Figure
                    label={t('sim.deployVelocity')}
                    value={fig.deployVelocity == null ? null : u.fmtSym('velocity', fig.deployVelocity)}
                    warn={
                      fig.deployVelocity != null && fig.deployVelocity > settings.simulation.deploymentSpeedWarn
                        ? t('simpleTool.deployFast', {
                            speed: u.fmtSym('velocity', settings.simulation.deploymentSpeedWarn),
                          })
                        : null
                    }
                  />
                  <Figure
                    label={t('simpleTool.landingSpeed')}
                    value={u.fmtSym('velocity', fig.landingVelocity)}
                    warn={
                      fig.landingVelocity > MAIN_BAND.max
                        ? t('simpleTool.landsHard', { speed: u.fmtSym('velocity', MAIN_BAND.max) })
                        : null
                    }
                  />
                  <Figure label={t('sim.flightTime')} value={seconds(fig.flightTime)} />
                </Figures>
              )}
              <p className="text-xs text-ink-muted">{t('simpleTool.stabilityNote')}</p>
            </div>
          )}
        </ToolResultCard>
      </div>
      <SimpleHelp at="side" />
      {picking && inputs && (
        <MotorDialog
          onClose={() => setPicking(false)}
          onSelect={(spec) => {
            setMotor(spec);
            setPicking(false);
          }}
          onError={setErr}
          mount={simpleMountFit(inputs)}
          current={motor}
        />
      )}
      {guiding && inputs && (
        <SimpleMotorGuide
          inputs={inputs}
          launch={launch}
          flownKey={simpleKey(inputs, launch)}
          guide={guide}
          onGuide={setGuide}
          onUse={(row) => {
            // A canopy sized for the card's motor stays the one the guide flew,
            // rather than resizing for this motor's casing under its figures.
            if (chuteOn && chuteDiameterM == null && inputs.chute) setChuteDiameterM(inputs.chute.diameterM);
            setMotor(row.spec);
            setFlown({ figures: row.figures, nearest: row.nearest, key: simpleKey(inputs, launch, row.spec) });
            setGuiding(false);
          }}
          onClose={() => setGuiding(false)}
        />
      )}
    </ToolLayout>
  );
}

/** A titled block of figures, with an optional line on how far to trust them. */
function Figures({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
      {note && <p className="mt-0.5 text-xs text-ink-muted">{note}</p>}
      <dl className="mt-2 space-y-1">{children}</dl>
    </div>
  );
}

function Figure({ label, value, warn }: { label: string; value: string | null; warn?: string | null }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-xs text-ink-muted">{label}</dt>
        <dd className={`text-sm tabular-nums ${warn ? 'text-warn-400' : 'text-ink'}`}>{value ?? NO_VALUE}</dd>
      </div>
      {warn && <p className="text-xs text-warn-400">{warn}</p>}
    </div>
  );
}
