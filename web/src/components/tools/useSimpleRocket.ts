import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rememberedSlot, useRemembered } from './remembered';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { useWorkspaceStore } from '../../state/store';
import { fireAction } from '../../state/fireAction';
import { flySimple, simpleKey } from './simpleFlight';
import { findSeated } from '../../services/motors/seatedMotor';
import type { MotorSpec } from '../../engine/openRocketEngine';
import { loadCatalog } from '../../services/motors/motorDb';
import { nearestDelay } from '../../services/flight/motorGuide';
import { canopyRoundUp } from '../../services/flight/recoverySizing';
import { errorText } from '../../i18n/keyedError';
import {
  SIMPLE_CHUTE_CD,
  simpleChuteDiameter,
  simpleConfig,
  simpleFins,
  simpleProblem,
  simpleRocketTree,
  type SimpleFigures,
  type SimpleFinShape,
  type SimpleGuide,
  type SimpleInputs,
} from '../../services/flight/simpleRocket';

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
  chuteDiameterM: number | null;
  chuteCd: number | null;
  motor: MotorSpec | null;
  flown: Flown | null;
  guide: SimpleGuide | null;
}
const remembered = rememberedSlot<Remembered>();

interface Flown {
  figures: SimpleFigures;
  nearest: number | null;
  key: string;
}

export function useSimpleRocket() {
  const { t } = useTranslation();
  const u = useUnits();
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
  const [flying, setFlying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const launch = { rodLengthM: rodLengthM ?? 1, launchAltitudeM: siteM ?? 0, temperatureC };
  const lengthUnit = (field: string) => u.at(unitScope('launch', field), 'length');
  const chuteSized =
    dryMassKg != null && chuteCd != null
      ? canopyRoundUp(simpleChuteDiameter(dryMassKg, motor, launch, chuteCd), lengthUnit('simpleChuteDiameter').sym)
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
  const standIn = diameterM != null ? simpleFins({ diameterM }) : null;

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
  const openAsDesign = () => {
    if (!ready) return;
    fireAction(
      openNewDesign(simpleRocketTree(inputs, motor), simpleConfig(motor), {
        launchRodLengthM: launch.rodLengthM,
        launchAltitudeM: launch.launchAltitudeM,
        temperatureC: launch.temperatureC,
      }),
    );
  };

  return {
    u,
    lengthUnit,
    launch,
    diameterM,
    setDiameterM,
    lengthM,
    setLengthM,
    dryMassKg,
    setDryMassKg,
    mountDiameterM,
    setMountDiameterM,
    cgM,
    setCgM,
    rodLengthM,
    setRodLengthM,
    siteM,
    setSiteM,
    temperatureC,
    setTemperatureC,
    finCount,
    setFinCount,
    finShape,
    setFinShape,
    finRootM,
    setFinRootM,
    finSpanM,
    setFinSpanM,
    chuteOn,
    setChuteOn,
    chuteDiameterM,
    setChuteDiameterM,
    chuteCd,
    setChuteCd,
    chuteSized,
    motor,
    setMotor,
    flown,
    setFlown,
    guide,
    setGuide,
    inputs,
    problem,
    key,
    shaped,
    ready,
    standIn,
    flying,
    err,
    setErr,
    fly,
    cancel,
    openAsDesign,
  };
}

export type SimpleRocket = ReturnType<typeof useSimpleRocket>;
