/** Stored in SI. Keys stay literal so the i18n key scan can find them. */
export const SPEED_WARNINGS = [
  { key: 'deploymentSpeedWarn', label: 'settings.deploySpeedWarn', hint: 'settings.deploySpeedWarnHint' },
  { key: 'mainHighSpeedWarn', label: 'settings.mainHighSpeedWarn', hint: 'settings.mainHighSpeedWarnHint' },
  { key: 'mainLowSpeedWarn', label: 'settings.mainLowSpeedWarn', hint: 'settings.mainLowSpeedWarnHint' },
  { key: 'drogueLowSpeedWarn', label: 'settings.drogueLowSpeedWarn', hint: 'settings.drogueLowSpeedWarnHint' },
] as const;

const TOO_FAST = new Set(['HighSpeedDeployment', 'RECOVERY_MAIN_HIGH_SPEED']);
const TOO_SLOW = new Set(['RECOVERY_MAIN_LOW_SPEED']);

/**
 * `deploymentSpeedWarn` must be the simulation's effective value. Matched by `sourceIds`
 * (unnamed devices share a kernel default name); a name in `sharedNames` does not count.
 */
export function deploymentVerdict(
  speed: number,
  warnings: readonly { key: string; message?: string; sourceIds?: readonly string[] }[] | undefined,
  deploymentSpeedWarn: number,
  devices: readonly DeployedDevice[],
  sharedNames: ReadonlySet<string> = new Set(),
): 'tooFast' | 'tooSlow' | null {
  if (!warnings) return speed > deploymentSpeedWarn ? 'tooFast' : null;
  const own = warnings.filter((w) =>
    w.sourceIds?.length
      ? devices.some((d) => d.id != null && w.sourceIds!.includes(d.id))
      : devices.some((d) => d.name !== '' && !sharedNames.has(d.name) && w.message?.includes(`"${d.name}"`)),
  );
  if (own.some((w) => TOO_FAST.has(w.key))) return 'tooFast';
  if (own.some((w) => TOO_SLOW.has(w.key))) return 'tooSlow';
  return null;
}

export interface DeployedDevice {
  id?: string;
  name: string;
}

/** Devices at the same instant count; an earlier drogue does not. */
export function lastDeployment(
  events: readonly { type: string; time?: number; source?: string; sourceId?: string }[] | undefined,
): DeployedDevice[] {
  const deployments = (events ?? []).filter((e) => e.type === 'RECOVERY_DEVICE_DEPLOYMENT');
  const last = deployments[deployments.length - 1];
  if (!last) return [];
  return deployments.flatMap((e) =>
    e.time === last.time && (e.source || e.sourceId) ? [{ id: e.sourceId, name: e.source ?? '' }] : [],
  );
}
