import type { StaticInfo } from '../../engine/openRocketEngine';
import type { MaterialDensity, ReportModel } from './reportModel';
import { exportFilename, saveText } from '../files/saveFile';
import { siToUi, type Quantity, type UnitSelection } from '../../prefs/units';
import { plainDecimal, plainSig } from '../files/numberText';
import { staticInfoRows } from './designInfo';
import { type StatKey } from './designInfo';
import { csvField } from '../exports/csvCell';
import { CSV_MIME } from '../exports/csvExport';
import i18n from '../../i18n';
import { partLabel } from '../../i18n/format';
import { chargeName } from '../flight/recoveryCharges';
import { effectiveBay } from '../flight/recoveryBays';

// Field names are English, apart from a part named in one: its own name, or its type in the UI language.
// Values use '.' regardless of locale.

const round = (v: number, d: number): string => plainDecimal(v, d);

// Significant figures: fixed decimals would write a 0.5 mm wall in meters as 0.001.
const fig = (q: Quantity, symbol: string, si: number): string => plainSig(siToUi(q, symbol, si), 6);

// Security: names come from imported .ork files; csvField neutralizes formula injection.
const cell = (s: string): string => csvField(s);

function summaryRows(info: StaticInfo, units: UnitSelection): [string, string, string][] {
  const len = (si: number): [string, string] => [fig('length', units.length, si), units.length];
  const mass = (si: number): [string, string] => [fig('mass', units.mass, si), units.mass];
  const cellFor = (key: StatKey, v: number): [string, string] => {
    switch (key) {
      case 'massEmpty':
      case 'massLoaded':
        return mass(v);
      case 'fineness':
        return [round(v, 2), ''];
      case 'stabilityCal':
        return [round(v, 2), 'cal'];
      case 'stabilityPct':
        return [round(v, 1), '%'];
      case 'cd':
        return [round(v, 3), ''];
      case 'cna':
        return [round(v, 2), '/rad'];
      case 'pitchInertia':
      case 'rollInertia':
        return [plainSig(v, 4), 'kg·m²'];
      default:
        return len(v);
    }
  };
  return staticInfoRows(info).map(({ key, field, value }) => [field, ...cellFor(key, value)]);
}

// Desktop messages.properties DesignType.*, keyed by the token without underscores.
const DESIGN_TYPE_LABEL: Record<string, string> = {
  original: 'Original Design/Other',
  commercialkit: 'Commercial Kit',
  clonekit: 'Clone of Commercial Kit',
  upscalekit: 'Upscale of Commercial Kit',
  downscalekit: 'Downscale of Commercial Kit',
  modifiedkit: 'Modification of a Commercial Kit',
  kitbash: 'Kit Bash of Commercial Kits',
};

const designTypeLabel = (token: string | undefined): string =>
  token ? (DESIGN_TYPE_LABEL[token.toLowerCase().replace(/_/g, '')] ?? token) : DESIGN_TYPE_LABEL['original']!;

export function buildDesignCsv(model: ReportModel, units: UnitSelection): string {
  const lines: string[] = ['Scope,Field,Value,Unit'];
  const push = (scope: string, field: string, value: string, unit: string) =>
    lines.push([scope, field, value, unit].map(cell).join(','));

  push('Design', 'Name', model.name, '');
  push('Design', 'Design Type', designTypeLabel(model.designType), '');
  push('Design', 'Stages', String(model.stages.length), '');

  for (const [field, value, unit] of summaryRows(model.whole.info, units)) push('Rocket', field, value, unit);
  for (const st of model.stageSummaries)
    for (const [field, value, unit] of summaryRows(st.info, units)) push(st.label, field, value, unit);

  for (const st of model.finSetsByStage) {
    for (const s of st.sets) {
      const label = st.sets.length > 1 ? `${partLabel(i18n.t, s)}: ` : 'Fin set: ';
      push(st.stage, `${label}Nose to top of fin root`, fig('length', units.length, s.topX), units.length);
      push(st.stage, `${label}Nose to bottom of fin root`, fig('length', units.length, s.bottomX), units.length);
    }
  }

  // A missing charge is a blank Value, not a missing row, so every file has every field.
  const charges = model.charges ?? [];
  const where = (stageName: string | undefined, tube: string) =>
    stageName === undefined ? tube : `${partLabel(i18n.t, { name: stageName, type: 'stage' })}: ${tube}`;
  for (const r of charges) {
    const shared = charges.filter((x) => x.role === r.role).length > 1;
    const field = (name: string) => (shared ? `${name} (${where(r.stageName, r.tubeName || r.tubeId)})` : name);
    for (const backup of [false, true]) {
      const kg = backup ? r.backupKg : r.primaryKg;
      push(
        'Recovery charges',
        field(chargeName(r.role, backup)),
        kg == null ? '' : fig('mass', units.mass, kg),
        units.mass,
      );
    }
    push('Recovery charges', field(`${chargeName(r.role, false)} bay`), where(r.stageName, r.tubeName), '');
  }

  for (const bay of model.bays ?? []) {
    const scope = where(bay.stageName, `${bay.role === 'main' ? 'Main' : 'Drogue'} bay`);
    const s = effectiveBay(bay);
    push(scope, 'Tube', bay.tubeName, '');
    push(scope, 'Bore', fig('length', units.length, s.boreM), units.length);
    push(scope, 'Length', fig('length', units.length, s.lengthM), units.length);
    push(scope, 'Target pressure', fig('pressure', units.pressure, s.pressurePa), units.pressure);
    push(scope, 'Shear pins', String(s.pins.count), '');
    if (s.pins.count > 0) push(scope, 'Shear pin strength', fig('force', units.force, s.pins.forceN), units.force);
    bay.record.tests.forEach((x, i) => {
      const n = `Test ${i + 1}`;
      push(scope, `${n} date`, x.date, '');
      push(scope, `${n} charge`, fig('mass', units.mass, x.chargeKg), units.mass);
      push(scope, `${n} shear pins`, String(x.pins?.count ?? 0), '');
      push(scope, `${n} result`, x.result, '');
      push(scope, `${n} notes`, x.notes, '');
      if (x.id === bay.record.flownTestId) push(scope, `${n} flown`, 'yes', '');
    });
  }

  return lines.join('\r\n') + '\r\n';
}

const DENSITY_KINDS: readonly MaterialDensity[] = ['density', 'surfaceDensity', 'lineDensity'];

export function buildComponentCsv(
  model: ReportModel,
  units: UnitSelection,
  partName: (type: string) => string,
): string {
  const lines = [
    [
      'Stage',
      'Depth',
      'Type',
      'Name',
      'Material',
      `Density (${units.density})`,
      `Surface density (${units.surfaceDensity})`,
      `Line density (${units.lineDensity})`,
      `Length (${units.length})`,
      `Outer diameter (${units.length})`,
      `Inner diameter (${units.length})`,
      `Fore diameter (${units.length})`,
      `Aft diameter (${units.length})`,
      `Thickness (${units.length})`,
      `Mass (${units.mass})`,
    ].join(','),
  ];
  const len = (m: number | undefined) => (m == null ? '' : fig('length', units.length, m));
  const dia = (r: number | undefined) => (r == null ? '' : len(2 * r));
  for (const st of model.partsByStage) {
    for (const p of st.rows) {
      lines.push(
        [
          cell(st.stage),
          String(p.depth),
          cell(partName(p.type)),
          cell(p.name),
          cell(p.material ?? ''),
          ...DENSITY_KINDS.map((k) =>
            p.density == null || (p.densityKind ?? 'density') !== k ? '' : fig(k, units[k], p.density),
          ),
          len(p.length),
          dia(p.outerR),
          dia(p.innerR),
          dia(p.foreR),
          dia(p.aftR),
          len(p.thickness),
          fig('mass', units.mass, p.mass),
        ].join(','),
      );
    }
  }
  return lines.join('\r\n') + '\r\n';
}

export function downloadComponentCsv(
  model: ReportModel,
  units: UnitSelection,
  partName: (type: string) => string,
): void {
  void saveText(buildComponentCsv(model, units, partName), exportFilename([model.name, 'parts'], 'csv'), CSV_MIME);
}

export function downloadDesignCsv(model: ReportModel, units: UnitSelection): void {
  void saveText(buildDesignCsv(model, units), exportFilename([model.name, 'design'], 'csv'), CSV_MIME);
}
