import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { recoveryDevices, stageMain } from '../../services/design/treeEdit';
import { useWorkspaceStore } from '../../state/store';
import { partLabel } from '../../i18n/format';
import { PropSection } from './PropSection';
import { RadioGroup } from '../common/RadioGroup';
import { SelectRow } from '../common/SelectRow';

function DeviceSelect({
  label,
  value,
  current,
  options,
  enabled,
  onChange,
  none,
}: {
  label: string;
  value: string;
  current: ComponentNode | undefined;
  options: ComponentNode[];
  enabled: boolean;
  onChange: (id: string) => void;
  /** Label of a blank first option, for when no device is chosen. */
  none?: string;
}) {
  const { t } = useTranslation();
  return (
    <SelectRow
      label={label}
      value={value}
      disabled={!enabled}
      title={current ? partLabel(t, current) : undefined}
      onChange={onChange}
      width="min-w-0 flex-1"
    >
      {none !== undefined && <option value="">{none}</option>}
      {options.map((d) => (
        <option key={d.id as string} value={d.id as string}>
          {partLabel(t, d)}
        </option>
      ))}
    </SelectRow>
  );
}

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
          <DeviceSelect
            label={t('prop.drogueDevice')}
            value={picked}
            current={shown}
            options={devices}
            enabled={dual}
            onChange={(id) => setDrogue(stageId, id)}
          />
          <DeviceSelect
            label={t('prop.mainDevice')}
            value={main?.id ?? ''}
            current={main}
            options={mains}
            enabled={dual && mains.length > 0}
            onChange={(id) => setMain(stageId, id)}
            none={main ? undefined : t('prop.mainNone')}
          />
        </>
      ) : (
        <p className="text-xs text-ink-faint">{t('prop.noDevices')}</p>
      )}
    </PropSection>
  );
}
