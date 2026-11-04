import { PLUGGED_DELAY, type ComponentNode } from '../../../engine/openRocketEngine';
import { xmlText as text } from '../xmlUtil';
import { type OrkMotorRef, type OrkFlightConfig, defaultOrkConfig } from '../orkTypes';
import { nonNegTag, numTag, readDeploymentTags, readSeparationTags } from './importTags';
import { MAX_MOTOR_CONFIGS } from './importLimits';
import { finiteNum } from './numbers';
import { keyedNote, notePartName, type ImportNote } from '../importNote';
import { KeyedError } from '../../../i18n/keyedError';
import { IGNITION_EVENTS } from '../../design/componentFields';

export interface OrkImportContext {
  configs: OrkFlightConfig[];
  chosenConfigId: string | null;
  notes: ImportNote[];
  ignored: Set<string>;
  motors: Record<string, OrkMotorRef>;
  motor: OrkMotorRef | undefined;
  /** One running total against MAX_COMPONENTS, since the readers recurse. */
  nodeCount: number;
}

/** Past the cap the file is refused, not truncated, since a save would drop the rest. */
export function readFlightConfigs(rocketEl: Element): {
  configEls: Element[];
  configs: OrkFlightConfig[];
  chosenConfigId: string | null;
} {
  const configEls = Array.from(rocketEl.querySelectorAll(':scope > motorconfiguration'));
  if (configEls.length > MAX_MOTOR_CONFIGS) throw new KeyedError('errors.file.tooManyConfigs');
  // A repeated id merges, as createFlightConfiguration does.
  const byId = new Map<string, OrkFlightConfig>();
  for (const c of configEls) {
    const id = c.getAttribute('configid') ?? '';
    if (id === '') continue;
    const name = text(c, ':scope > name');
    const isDefault = c.getAttribute('default') === 'true';
    const seen = byId.get(id);
    if (seen) {
      if (name?.trim()) seen.name = name;
      seen.isDefault ||= isDefault;
      continue;
    }
    byId.set(id, defaultOrkConfig({ id, name, isDefault }));
  }
  const configs = [...byId.values()];
  const chosenConfigId = configs.find((c) => c.isDefault)?.id ?? configs[0]?.id ?? null;
  return { configEls, configs, chosenConfigId };
}

const configChild = (el: Element, tag: string, id: string): Element | null =>
  Array.from(el.children).find((x) => x.tagName === tag && x.getAttribute('configid') === id) ?? null;

// Hand-rolled files may key <motor configid>s without declarations.
export function configScoped(ctx: OrkImportContext, el: Element, tag: string): Element | null {
  return ctx.chosenConfigId === null ? el.querySelector(`:scope > ${tag}`) : configChild(el, tag, ctx.chosenConfigId);
}

/** Every configuration's block, so a save cannot rewrite other configurations. */
export function captureDeployments(ctx: OrkImportContext, el: Element, node: ComponentNode): void {
  captureOverrides(ctx, el, node, 'deploymentconfiguration', readDeploymentTags, (c) => c.deployments);
}

/** Over the bare defaults, as desktop's handlers clone the default first. */
function captureOverrides<O extends object>(
  ctx: OrkImportContext,
  el: Element,
  node: ComponentNode,
  tag: string,
  read: (from: Element, node: ComponentNode, notes: OrkImportContext['notes'] | undefined) => O,
  into: (c: OrkFlightConfig) => Record<string, O>,
): void {
  if (!node.id) return;
  for (const c of ctx.configs) {
    const block = configChild(el, tag, c.id);
    if (!block) continue;
    const o = { ...read(el, node, undefined), ...read(block, node, ctx.notes) };
    if (Object.keys(o).length > 0) into(c)[node.id] = o;
  }
}

/** `stageIds` must come from the same walk as the file's numbering (treeEdit.findStages). */
export function readStageActiveness(configEls: Element[], configs: OrkFlightConfig[], stageIds: string[]): void {
  for (const el of configEls) {
    const config = configs.find((c) => c.id === el.getAttribute('configid'));
    if (!config) continue;
    for (const flag of Array.from(el.querySelectorAll(':scope > stage'))) {
      if (flag.getAttribute('active') !== 'false') continue;
      // `Number(null)` and `Number('')` are 0, which would ground the sustainer.
      const num = finiteNum(flag.getAttribute('number'));
      if (num === undefined) continue;
      const id = stageIds[num];
      if (id && !config.grounded.includes(id)) config.grounded.push(id);
    }
  }
}

export function captureSeparations(ctx: OrkImportContext, el: Element, node: ComponentNode): void {
  captureOverrides(ctx, el, node, 'separationconfiguration', readSeparationTags, (c) => c.separations);
}

/** MotorHandler reads "none", absent and unparsable as plugged; 0 s would fire at burnout. */
function readDelay(motorEl: Element): number {
  const t = text(motorEl, ':scope > delay');
  if (t === null || t === 'none') return PLUGGED_DELAY;
  const v = finiteNum(t);
  return v === undefined ? PLUGGED_DELAY : Math.max(0, v);
}

export function readMotor(ctx: OrkImportContext, el: Element, node: ComponentNode): void {
  const mountEl = el.querySelector(':scope > motormount');
  if (!mountEl) return;
  node['motorMount'] = true;
  const overhang = numTag(mountEl, 'overhang', 0);
  if (overhang !== 0) node['motorOverhang'] = overhang;
  // Unknown events are dropped as MotorMountHandler drops them.
  const bareEvent = text(mountEl, ':scope > ignitionevent')?.trim();
  if (bareEvent && bareEvent !== 'automatic' && IGNITION_EVENTS.some((ev) => ev === bareEvent)) {
    node['ignitionEvent'] = bareEvent;
  }
  const bareDelay = nonNegTag(mountEl, 'ignitiondelay', 0);
  if (bareDelay !== 0) node['ignitionDelay'] = bareDelay;
  const ignitionEvent = (igEl: Element | undefined): string | undefined =>
    (igEl && text(igEl, ':scope > ignitionevent')) ?? text(mountEl, ':scope > ignitionevent') ?? undefined;
  const ignitionDelay = (igEl: Element | undefined): number =>
    nonNegTag(igEl && text(igEl, ':scope > ignitiondelay') !== null ? igEl : mountEl, 'ignitiondelay', 0);
  const resolveRef = (motorEl: Element, igEl: Element | undefined): OrkMotorRef => {
    const digest = text(motorEl, ':scope > digest');
    const maker = text(motorEl, ':scope > manufacturer')?.trim();
    return {
      // Empty, never a placeholder word: it reaches UI labels untranslated.
      designation: text(motorEl, ':scope > designation') ?? '',
      ...(digest ? { digest } : {}),
      // Absent stays absent: findMotors filters on a maker only when one is given.
      ...(maker ? { manufacturer: maker } : {}),
      diameter: nonNegTag(motorEl, 'diameter', 0.018),
      length: nonNegTag(motorEl, 'length', 0.07),
      delay: readDelay(motorEl),
      mountId: node.id,
      ignitionEvent: ignitionEvent(igEl),
      ignitionDelay: ignitionDelay(igEl),
    };
  };
  if (node.id) {
    for (const cfg of ctx.configs) {
      const byId = (tag: string) =>
        Array.from(mountEl.children).find((c) => c.tagName === tag && c.getAttribute('configid') === cfg.id);
      const cfgMotorEl = byId('motor');
      if (!cfgMotorEl) continue;
      cfg.motors[node.id] = resolveRef(cfgMotorEl, byId('ignitionconfiguration'));
    }
  }
  const motorEl = configScoped(ctx, mountEl, 'motor');
  if (!motorEl) return;
  const ref = resolveRef(motorEl, configScoped(ctx, mountEl, 'ignitionconfiguration') ?? undefined);
  if (!ref.designation) ctx.notes.push(keyedNote('importNote.motorNoDesignation', { mount: notePartName(node) }));
  if (ref.delay >= PLUGGED_DELAY) {
    const unstated = text(motorEl, ':scope > delay') !== 'none';
    ctx.notes.push(
      keyedNote(unstated ? 'importNote.motorPluggedNoDelay' : 'importNote.motorPlugged', { motor: ref.designation }),
    );
  }
  if (node.id) {
    ctx.motors[node.id] = ref;
  }
  if (!ctx.motor) ctx.motor = ref;
}
