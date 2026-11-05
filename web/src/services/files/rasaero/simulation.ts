import type { ComponentNode } from '../../../engine/openRocketEngine';
import { PLUGGED_DELAY } from '../../../engine/openRocketEngine';
import type { Keyed } from '../../../i18n/keyedError';
import { escapeXml as esc } from '../xmlUtil';
import { FT, IN, LB, fmt, type Cdx1Writer } from './units';
import { mountMotorCount, type StageEngineSlot } from './engines';
import type { StageLaunch } from './stageLaunch';
import { num, str } from '../../../tree/nodeProps';
import { KERNEL_SEPARATION } from '../../../tree/kernelDefaults';
import { notePartName } from '../importNote';

/** `[mach, altitude m]` rows. */
export type MachAltTable = [number, number][];

export function writeMachAlt(w: Cdx1Writer, machAlt: MachAltTable | undefined): void {
  const { emit } = w;
  if (machAlt && machAlt.length > 0) {
    emit('<MachAlt>');
    for (const [mach, altM] of machAlt) emit(`<Item>${fmt(mach)}, ${fmt(altM * FT)}</Item>`);
    emit('</MachAlt>');
  } else {
    emit('<MachAlt></MachAlt>');
  }
}

export const RASAERO_STAGE_MASS_WARNING: Keyed = { key: 'errors.exportRasaeroStageMass' };

/** Inches. A cluster is one nozzle of the same total exit area, as `SimulationDTO.getNozzleExitDiameter`. */
export function stageNozzles(stagesIn: readonly ComponentNode[], slots: readonly StageEngineSlot[]): number[] {
  return stagesIn.map((st, i) => {
    const mount = slots[i]?.mount;
    return mount ? num(st, 'nozzleExitDiameter', 0) * Math.sqrt(mountMotorCount(mount)) * IN : 0;
  });
}

export interface SimulationInput {
  stageLaunch: readonly (StageLaunch | undefined)[];
  grounded?: readonly string[];
  nozzles: readonly number[];
}

/** RASAero times run from each booster's burnout, ignition after separation (`SimulationDTO.setStagingDelays`). */
function stagingDelays(
  w: Cdx1Writer,
  stagesIn: readonly ComponentNode[],
  slots: readonly StageEngineSlot[],
  included: readonly boolean[],
): { ignition: number[]; separation: number[] } {
  const ignition = stagesIn.map((_, i) => slots[i]?.motor?.ignitionDelay ?? 0);
  const separation = stagesIn.map(() => 0);
  for (let lower = 1; lower <= Math.min(2, stagesIn.length - 1); lower++) {
    if (!included[lower]) continue;
    const lowerStage = stagesIn[lower]!;
    const upperStage = stagesIn[lower - 1]!;
    const lowerDelay = slots[lower]?.motor?.delay ?? 0;
    const plugged = lowerDelay >= PLUGGED_DELAY;
    const upper = slots[lower - 1]?.motor;

    let ignite = 0;
    if (upper) {
      const ev = upper.ignitionEvent ?? 'automatic';
      if ((ev === 'automatic' || ev === 'ejectioncharge') && !plugged) ignite = lowerDelay;
      else if (ev !== 'burnout') {
        w.warn({
          key: 'errors.exportRasaeroIgnitionEvent',
          values: { stage: notePartName(upperStage), event: { key: `ignition.${ev}` } },
        });
      }
      ignite += upper.ignitionDelay ?? 0;
    }

    const sepEv = str(lowerStage, 'separationEvent', KERNEL_SEPARATION.separationEvent);
    let separate = 0;
    if (sepEv === 'ejection' && !plugged) separate = lowerDelay;
    else if (sepEv === 'upperignition' && upper) separate = ignite;
    else if (sepEv !== 'burnout') {
      w.warn({
        key: 'errors.exportRasaeroSeparationEvent',
        values: { stage: notePartName(lowerStage), event: { key: `separationEvent.${sepEv}` } },
      });
    }
    separate += num(lowerStage, 'separationDelay', KERNEL_SEPARATION.separationDelay);

    // RASAero cannot ignite the upper stage before the lower stage separates.
    let afterSeparation = ignite - separate;
    if (afterSeparation < 0) {
      w.warn({ key: 'errors.exportRasaeroIgnitionBeforeSeparation', values: { stage: notePartName(upperStage) } });
      afterSeparation = 0;
    }
    separation[lower] = separate;
    ignition[lower - 1] = afterSeparation;
  }
  return { ignition, separation };
}

/**
 * RASAero's loader dereferences every child without null checks, so all are written
 * except *Engine elements; it aborts on an included booster with no engine (`SimulationDTO`).
 */
export function writeSimulationList(
  w: Cdx1Writer,
  stagesIn: ComponentNode[],
  slots: StageEngineSlot[],
  { stageLaunch, grounded, nozzles }: SimulationInput,
): void {
  const { emit } = w;
  const stageEngines = slots.map((s) => s.engine);
  const flies = (i: number) => !grounded?.includes(stagesIn[i]?.id ?? '');
  const included = stagesIn.map((_, i) => !!stageEngines[i] && flies(i));
  if (stagesIn.some((_, i) => stageLaunch[i] === undefined)) w.warn(RASAERO_STAGE_MASS_WARNING);
  const { ignition, separation } = stagingDelays(w, stagesIn, slots, included);
  stagesIn.forEach((st, i) => {
    if (flies(i) && slots[i]?.extraMotors) {
      w.warn({ key: 'errors.exportRasaeroExtraMotors', values: { stage: notePartName(st) } });
    }
  });
  const stackWt = (i: number): string => fmt((stageLaunch[i]?.massKg ?? 0) * LB);
  const stackCg = (i: number): string => fmt((stageLaunch[i]?.cgM ?? 0) * IN);
  const nozzle = (i: number): string => fmt(nozzles[i] ?? 0);
  emit('<SimulationList>');
  emit('<Simulation>');
  if (stageEngines[0]) emit(`<SustainerEngine>${esc(stageEngines[0])}</SustainerEngine>`);
  emit(`<SustainerLaunchWt>${stackWt(0)}</SustainerLaunchWt>`);
  emit(`<SustainerNozzleDiameter>${nozzle(0)}</SustainerNozzleDiameter>`);
  emit(`<SustainerCG>${stackCg(0)}</SustainerCG>`);
  emit(`<SustainerIgnitionDelay>${fmt(ignition[0] ?? 0)}</SustainerIgnitionDelay>`);
  if (stageEngines[1]) emit(`<Booster1Engine>${esc(stageEngines[1])}</Booster1Engine>`);
  emit(`<Booster1LaunchWt>${stackWt(1)}</Booster1LaunchWt>`);
  emit(`<Booster1SeparationDelay>${fmt(separation[1] ?? 0)}</Booster1SeparationDelay>`);
  emit(`<Booster1IgnitionDelay>${fmt(ignition[1] ?? 0)}</Booster1IgnitionDelay>`);
  emit(`<Booster1CG>${stackCg(1)}</Booster1CG>`);
  emit(`<Booster1NozzleDiameter>${nozzle(1)}</Booster1NozzleDiameter>`);
  emit(`<IncludeBooster1>${included[1] ? 'True' : 'False'}</IncludeBooster1>`);
  if (stageEngines[2]) emit(`<Booster2Engine>${esc(stageEngines[2])}</Booster2Engine>`);
  emit(`<Booster2LaunchWt>${stackWt(2)}</Booster2LaunchWt>`);
  // RASAero's own tag, not `Booster2SeparationDelay` (RASAeroCommonConstants.BOOSTER2_SEPARATION_DELAY).
  emit(`<Booster2Delay>${fmt(separation[2] ?? 0)}</Booster2Delay>`);
  emit(`<Booster2CG>${stackCg(2)}</Booster2CG>`);
  emit(`<Booster2NozzleDiameter>${nozzle(2)}</Booster2NozzleDiameter>`);
  emit(`<IncludeBooster2>${included[2] ? 'True' : 'False'}</IncludeBooster2>`);
  emit('<FlightTime>0</FlightTime>');
  emit('<TimetoApogee>0</TimetoApogee>');
  emit('<MaxAltitude>0</MaxAltitude>');
  emit('<MaxVelocity>0</MaxVelocity>');
  emit('<OptimumWt>0</OptimumWt>');
  emit('<OptimumMaxAlt>0</OptimumMaxAlt>');
  emit('</Simulation>');
  emit('</SimulationList>');
}
