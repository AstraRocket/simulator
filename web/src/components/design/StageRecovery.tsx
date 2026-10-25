import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { recoveryDevices } from '../../services/design/treeEdit';
import { useWorkspaceStore } from '../../state/store';
import { partLabel } from '../../i18n/format';
import { PropSection } from './PropSection';
import { RadioGroup } from '../common/RadioGroup';

/**
 * A stage's recovery plan: single deployment, or dual with one of its devices
 * acting as the drogue.
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
 * It changes warnings only. A drogue and a main are simulated by their own
 * diameters and deployment events; what the flag picks is which speed
 * thresholds a deployment is judged against (see openRocketEngine's
 * `drogueLowSpeedWarn`).
 */
export function StageRecovery({ node }: { node: ComponentNode }) {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const setDrogue = useWorkspaceStore((s) => s.setStageDrogue);
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

  const deviceName = (d: ComponentNode) => partLabel(t, d);

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
        <label className="flex items-center justify-between gap-3 pl-6">
          <span className="text-xs text-ink-muted">{t('prop.drogueDevice')}</span>
          <select
            value={picked}
            disabled={!dual}
            aria-label={t('prop.drogueDevice')}
            onChange={(e) => setDrogue(stageId, e.target.value)}
            className={`w-32 rounded-md px-2 py-1 text-sm ring-1 ring-line/10 focus:outline-none focus:ring-accent-500 ${
              dual ? 'bg-raised text-ink-strong' : 'bg-raised/50 text-ink-faint'
            }`}
          >
            {devices.map((d) => (
              <option key={d.id as string} value={d.id as string}>
                {deviceName(d)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="pl-6 text-xs text-ink-faint">{t('prop.noDevices')}</p>
      )}
    </PropSection>
  );
}
