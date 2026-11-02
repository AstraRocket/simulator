import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { recoveryDevices, stageMain } from '../../services/design/treeEdit';
import { useWorkspaceStore } from '../../state/store';
import { partLabel } from '../../i18n/format';
import { PropSection } from './PropSection';
import { RadioGroup } from '../common/RadioGroup';

/**
 * A stage's recovery plan: single deployment, or dual with one of its devices
 * acting as the drogue and one as the main.
 *
 * The kernel's per-device drogue flag (`RecoveryDevice.setDrogue`), which no
 * desktop 24.12 dialog shows, offered as the stage's deployment mode. The flag
 * is stored per device, but what it describes is the stage: single deployment
 * is no drogue, dual is exactly one. A checkbox on each
 * chute would let a stage carry two drogues, a design the desktop cannot produce
 * and whose warnings then depend on which device the kernel walks into first.
 * Choosing here makes that unreachable, because `setStageDrogue` clears the
 * stage before it sets one.
 *
 * The drogue changes warnings only. A drogue and a main are simulated by their
 * own diameters and deployment events; what the flag picks is which speed
 * thresholds a deployment is judged against (see openRocketEngine's
 * `drogueLowSpeedWarn`). The main is the app's own pick (`setStageMain`), which
 * the kernel never sees: it says which bay carries the main charges, and leaves
 * any further device in the stage without a bay (`deviceRoles`).
 */
export function StageRecovery({ node }: { node: ComponentNode }) {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const setDrogue = useWorkspaceStore((s) => s.setStageDrogue);
  const setMain = useWorkspaceStore((s) => s.setStageMain);
  const stageId = node.id as string;

  const devices = recoveryDevices(tree, stageId);
  const drogue = devices.find((d) => d['drogue'] === true);
  const dual = drogue !== undefined;
  // With nothing to be the drogue there is no dual deployment to choose, so the
  // option is refused rather than offered and silently ignored.
  const hasDevices = devices.length > 0;
  // What the picker shows while single deployment is selected: the device that
  // would become the drogue, so switching over is one click and not two.
  const picked = drogue?.id ?? devices[0]?.id ?? '';
  const shown = devices.find((d) => d.id === picked);
  // The main is any device but the drogue: the one picked, else the first.
  const mains = devices.filter((d) => d !== drogue);
  const main = stageMain(devices);

  const deviceName = (d: ComponentNode) => partLabel(t, d);
  // The rest of the row after the label: device names run long ("Parachute
  // Main (Rocketman 4 ft)"), and a fixed width cuts them off.
  const select = (on: boolean) =>
    `min-w-0 flex-1 rounded-md px-2 py-1 text-sm ring-1 ring-line/10 focus:outline-none focus:ring-accent-500 ${
      on ? 'bg-raised text-ink-strong' : 'bg-raised/50 text-ink-faint'
    }`;

  return (
    <PropSection title={t('prop.recoveryType')}>
      <RadioGroup
        layout="inline"
        legend={t('prop.recoveryType')}
        options={['single', 'dual'] as const}
        value={dual ? 'dual' : 'single'}
        onChange={(r) => setDrogue(stageId, r === 'dual' ? picked : null)}
        fmt={(r) => t(r === 'dual' ? 'prop.dual' : 'prop.single')}
        isDisabled={(r) => r === 'dual' && !hasDevices}
      />
      {hasDevices ? (
        <>
          <label className="flex items-center justify-between gap-3">
            <span className="shrink-0 text-xs text-ink-muted">{t('prop.drogueDevice')}</span>
            <select
              value={picked}
              disabled={!dual}
              aria-label={t('prop.drogueDevice')}
              title={shown ? deviceName(shown) : undefined}
              onChange={(e) => setDrogue(stageId, e.target.value)}
              className={select(dual)}
            >
              {devices.map((d) => (
                <option key={d.id as string} value={d.id as string}>
                  {deviceName(d)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="shrink-0 text-xs text-ink-muted">{t('prop.mainDevice')}</span>
            <select
              value={main?.id ?? ''}
              disabled={!dual || mains.length === 0}
              aria-label={t('prop.mainDevice')}
              title={main ? deviceName(main) : undefined}
              onChange={(e) => setMain(stageId, e.target.value)}
              className={select(dual && mains.length > 0)}
            >
              {/* Single deployment has no main to pick: every device is one. */}
              {!main && <option value="">{t('prop.mainNone')}</option>}
              {mains.map((d) => (
                <option key={d.id as string} value={d.id as string}>
                  {deviceName(d)}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <p className="text-xs text-ink-faint">{t('prop.noDevices')}</p>
      )}
    </PropSection>
  );
}
