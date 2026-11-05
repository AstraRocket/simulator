import { PLUGGED_DELAY, type ComponentNode } from '../../../engine/openRocketEngine';
import { num } from '../../../tree/nodeProps';
import { mountIgnition } from '../../flight/flightConfigs';
import { escapeXml } from '../xmlUtil';
import { uuid } from '../../app/uuid';
import type { OrkTreeExportInput } from '../orkTypes';
import type { OrkWriteConfig, OrkWriter } from './exportWriter';

export function resolveWriteConfigs(input: Pick<OrkTreeExportInput, 'configs' | 'activeConfigId'>): {
  writeConfigs: OrkWriteConfig[];
  defaultId: string;
} {
  const { configs, activeConfigId } = input;
  if (!configs?.length) {
    const minted = { id: uuid(), name: null, motors: {}, deployments: null, separations: null, grounded: [] };
    return { writeConfigs: [minted], defaultId: minted.id };
  }
  const defaultId = configs.find((c) => c.id === activeConfigId)?.id ?? configs[0]!.id;
  const writeConfigs: OrkWriteConfig[] = configs.map((c) => ({
    id: c.id,
    name: c.name,
    motors: c.motors,
    deployments: c.deployments ?? null,
    separations: c.separations ?? null,
    grounded: c.grounded ?? [],
  }));
  return { writeConfigs, defaultId };
}

export function motorConfigurationsXml(w: OrkWriter, depth: number, stageIds: (string | undefined)[]): void {
  for (const c of w.writeConfigs) {
    w.emit(depth, `<motorconfiguration configid="${escapeXml(c.id)}"${c.id === w.defaultId ? ' default="true"' : ''}>`);
    if (c.name !== null) w.emit(depth + 1, `<name>${escapeXml(c.name)}</name>`);
    // Kernel stage numbering (treeEdit.findStages).
    stageIds.forEach((id, i) => {
      const active = !(id && c.grounded.includes(id));
      w.emit(depth + 1, `<stage number="${i}" active="${active}"/>`);
    });
    w.emit(depth, '</motorconfiguration>');
  }
}

export function mountConfigs(w: OrkWriter, nodeId: string | undefined): OrkWriteConfig[] {
  return nodeId ? w.writeConfigs.filter((c) => c.motors[nodeId]) : [];
}

// A mount with no motor still writes <motormount> so the flag round-trips (as desktop does).
export function motorMountXml(w: OrkWriter, depth: number, mount: ComponentNode): void {
  const { emit } = w;
  const nodeId = mount.id;
  const withMotor = mountConfigs(w, nodeId);
  // The mount's own ignition, as RocketComponentSaver writes `getDefaultMotorConfig()`.
  const bare = mountIgnition(mount);
  emit(depth, '<motormount>');
  emit(depth + 1, `<ignitionevent>${escapeXml(bare.ignitionEvent ?? 'automatic')}</ignitionevent>`);
  emit(depth + 1, `<ignitiondelay>${bare.ignitionDelay ?? 0}</ignitiondelay>`);
  emit(depth + 1, `<overhang>${num(mount, 'motorOverhang', 0)}</overhang>`);
  for (const c of withMotor) {
    const m = nodeId ? c.motors[nodeId] : undefined;
    if (!m) continue;
    emit(depth + 1, `<motor configid="${escapeXml(c.id)}">`);
    // No <type>: MotorHandler filters by it, and a wrong one finds nothing.
    // No <manufacturer> when unknown: findMotors filters on it, and a made-up one matches nothing.
    if (m.manufacturer) emit(depth + 2, `<manufacturer>${escapeXml(m.manufacturer)}</manufacturer>`);
    // Without the digest a shared designation resolves to the first database match.
    if (m.digest) emit(depth + 2, `<digest>${escapeXml(m.digest)}</digest>`);
    emit(depth + 2, `<designation>${escapeXml(m.designation)}</designation>`);
    emit(depth + 2, `<diameter>${m.diameter}</diameter>`);
    emit(depth + 2, `<length>${m.length}</length>`);
    emit(depth + 2, `<delay>${m.delay >= PLUGGED_DELAY ? 'none' : m.delay}</delay>`);
    emit(depth + 1, '</motor>');
  }
  for (const c of withMotor) {
    const m = nodeId ? c.motors[nodeId] : undefined;
    if (!m) continue;
    emit(depth + 1, `<ignitionconfiguration configid="${escapeXml(c.id)}">`);
    emit(depth + 2, `<ignitionevent>${escapeXml(m.ignitionEvent ?? 'automatic')}</ignitionevent>`);
    emit(depth + 2, `<ignitiondelay>${m.ignitionDelay ?? 0}</ignitiondelay>`);
    emit(depth + 1, '</ignitionconfiguration>');
  }
  emit(depth, '</motormount>');
}
