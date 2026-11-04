import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { recoveryDevices, stageMain } from '../../services/design/treeEdit';
import { useWorkspaceStore } from '../../state/store';
import { partLabel } from '../../i18n/format';
import { PropSection } from './PropSection';
import { RadioGroup } from '../common/RadioGroup';

// The drogue flag (`RecoveryDevice.setDrogue`) changes only warning thresholds, not the simulation.
export function StageRecovery({ node }: { node: ComponentNode }) {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const setDrogue = useWorkspaceStore((s) => s.setStageDrogue);
  const setMain = useWorkspaceStore((s) => s.setStageMain);
  const stageId = node.id as string;

  const devices = recoveryDevices(tree, stageId);
  const drogue = devices.find((d) => d['drogue'] === true);
  const dual = drogue !== undefined;
  const hasDevices = devices.length > 0;
  // In single mode, shows the device that would become the drogue.
  const picked = drogue?.id ?? devices[0]?.id ?? '';
  const shown = devices.find((d) => d.id === picked);
  const mains = devices.filter((d) => d !== drogue);
  const main = stageMain(devices);

  const deviceName = (d: ComponentNode) => partLabel(t, d);
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
