import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import {
  deployOverride,
  configLabel,
  sepOverride,
  stageFlies,
  type FlightConfig,
} from '../../services/flight/flightConfigs';
import { isRecoveryDevice } from '../../services/design/treeEdit';
import { useWorkspaceStore } from '../../state/store';
import type { ConfigsTab } from '../../state/tabs';

export function ConfigOverrideNote({ node }: { node: ComponentNode }) {
  const { t } = useTranslation();
  const configs = useWorkspaceStore((s) => s.configs);

  const id = node.id as string;
  const recovery = isRecoveryDevice(node.type);
  const sub: ConfigsTab = recovery ? 'recovery' : 'separation';
  const overriding = configs.filter((c) => (recovery ? deployOverride(c, id) : sepOverride(c, id)));
  const grounding = recovery ? [] : configs.filter((c) => !stageFlies(c, id));

  return (
    <>
      <NamedConfigs
        label={t(recovery ? 'configs.deployOverridden' : 'configs.separationOverridden')}
        configs={overriding}
        sub={sub}
      />
      <NamedConfigs label={t('configs.stageGrounded')} configs={grounding} sub="separation" />
    </>
  );
}

function NamedConfigs({ label, configs, sub }: { label: string; configs: FlightConfig[]; sub: ConfigsTab }) {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const setSelectedConfigId = useWorkspaceStore((s) => s.setSelectedConfigId);
  const setConfigsTab = useWorkspaceStore((s) => s.setConfigsTab);
  const setTab = useWorkspaceStore((s) => s.setTab);
  if (!configs.length) return null;

  return (
    <p className="mt-1 text-[11px] leading-snug text-warn-300/90">
      {label}{' '}
      {configs.map((c, i) => (
        <span key={c.id}>
          {i > 0 && ', '}
          <button
            type="button"
            onClick={() => {
              setSelectedConfigId(c.id);
              setConfigsTab(sub);
              setTab('configs');
            }}
            className="underline decoration-dotted hover:text-warn-200"
          >
            {configLabel(tree, c) || t('configs.noMotors')}
          </button>
        </span>
      ))}
    </p>
  );
}
