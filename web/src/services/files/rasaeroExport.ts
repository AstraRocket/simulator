import type { RocketTree } from '../../engine/openRocketEngine';
import type { LaunchConditions } from '../design/orkTree';
import { asStageNodes } from '../design/orkTree';
import { escapeXml as esc } from './xmlUtil';
import { saveBlob, exportFilename } from './saveFile';
import { createCdx1Writer, fmt } from './rasaero/units';
import { designSurface } from './rasaero/surface';
import { CDX1_ENGINE_EXPORT, stageEngineSlots, type Cdx1ExportEngine } from './rasaero/engines';
import { refuseAssemblies, writeSustainerChain } from './rasaero/sustainer';
import { writeBoosters } from './rasaero/booster';
import { writeRecovery } from './rasaero/recovery';
import { writeLaunchSite } from './rasaero/launchSite';
import { KeyedError, type Keyed } from '../../i18n/keyedError';
import { stageNozzles, writeMachAlt, writeSimulationList, type MachAltTable } from './rasaero/simulation';
import type { StageLaunch } from './rasaero/stageLaunch';

export interface Cdx1ExportInput {
  name: string;
  tree: RocketTree;
  /** Single-stage designs only; multi-stage cells are cumulative and need `stageLaunch`. */
  launchMassKg?: number;
  launchCgM?: number;
  stageLaunch?: readonly StageLaunch[];
  launch?: Partial<LaunchConditions>;
  machAlt?: MachAltTable;
  motors?: Record<string, Cdx1ExportEngine>;
  grounded?: readonly string[];
  engineExport?: boolean;
  warnings?: Keyed[];
}

export function exportCdx1({
  name,
  tree,
  launchMassKg,
  launchCgM,
  stageLaunch,
  launch,
  motors,
  engineExport,
  machAlt,
  grounded,
  warnings,
}: Cdx1ExportInput): string {
  const stagesIn = asStageNodes(tree);
  if (stagesIn.length > 3) throw new KeyedError('errors.rasaero.tooManyStages', { max: 3 });
  refuseAssemblies(stagesIn);
  const cells: readonly (StageLaunch | undefined)[] =
    stageLaunch ??
    (stagesIn.length === 1 && launchMassKg !== undefined ? [{ massKg: launchMassKg, cgM: launchCgM ?? 0 }] : []);

  const slots = stageEngineSlots(stagesIn, motors, engineExport ?? CDX1_ENGINE_EXPORT);
  const nozzles = stageNozzles(stagesIn, slots);
  const w = createCdx1Writer(warnings);
  const { emit } = w;

  emit('<RASAeroDocument>');
  emit('<FileVersion>2</FileVersion>');
  emit('<RocketDesign>');
  writeSustainerChain(w, stagesIn[0]!, stagesIn.length);
  writeBoosters(w, stagesIn, nozzles);
  emit(`<Surface>${designSurface(w, stagesIn)}</Surface>`);
  // 0, as RocketDesignDTO writes it.
  emit('<CP>0</CP>');
  emit('<ModifiedBarrowman>False</ModifiedBarrowman>');
  emit('<Turbulence>False</Turbulence>');
  emit(`<SustainerNozzle>${fmt(nozzles[0] ?? 0)}</SustainerNozzle>`);
  emit(`<Booster1Nozzle>${fmt(nozzles[1] ?? 0)}</Booster1Nozzle>`);
  emit(`<Booster2Nozzle>${fmt(nozzles[2] ?? 0)}</Booster2Nozzle>`);
  emit(`<UseBooster1>${stagesIn.length >= 2 ? 'True' : 'False'}</UseBooster1>`);
  emit(`<UseBooster2>${stagesIn.length === 3 ? 'True' : 'False'}</UseBooster2>`);
  emit(`<Comments>${esc(name)}</Comments>`);
  emit('</RocketDesign>');
  writeLaunchSite(w, launch);
  writeRecovery(w, stagesIn);
  writeMachAlt(w, machAlt);
  writeSimulationList(w, stagesIn, slots, { stageLaunch: cells, grounded, nozzles });
  emit('</RASAeroDocument>');
  return w.lines.join('\n');
}

export function downloadCdx1(input: Cdx1ExportInput): void {
  const xml = exportCdx1(input);
  const blob = new Blob([xml], { type: 'application/xml' });
  void saveBlob(blob, exportFilename([input.name, 'design'], 'CDX1'));
}
