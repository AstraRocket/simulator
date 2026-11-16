import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore, selectEditedConfig } from '../../state/store';
import { confirmDelete } from '../../state/confirmStore';
import { ConfigsTable } from './ConfigsTable';
import { ConfigEditor } from './ConfigEditor';
import { motorColumns, propAltitudeUnit, recoveryColumns, separationColumns } from './configColumns';
import { useIsDesktop } from '../common/useMediaQuery';
import { useUnits } from '../../prefs/useUnits';
import { ToolBtn } from '../common/ToolBtn';
import type { ConfigsTab } from '../../state/tabs';
import { ToggleButton } from '../common/ToggleButton';
import { RecoveryBaysPane } from './RecoveryBaysPane';

export function ConfigsPane() {
  const { t } = useTranslation();
  const u = useUnits();
  const desktop = useIsDesktop();
  const configs = useWorkspaceStore((s) => s.configs);
  const sims = useWorkspaceStore((s) => s.sims);
  const tree = useWorkspaceStore((s) => s.tree);
  const sub = useWorkspaceStore((s) => s.configsTab);
  const setSub = useWorkspaceStore((s) => s.setConfigsTab);
  const selected = useWorkspaceStore(selectEditedConfig);
  const onSelect = useWorkspaceStore((s) => s.setSelectedConfigId);
  const addConfig = useWorkspaceStore((s) => s.addConfig);
  const copyConfig = useWorkspaceStore((s) => s.copyConfig);
  const deleteConfig = useWorkspaceStore((s) => s.deleteConfig);

  const columns = useMemo(() => {
    if (sub === 'motors' || sub === 'bays') return motorColumns(tree, t);
    if (sub === 'recovery') {
      return recoveryColumns(tree, t, (device) => propAltitudeUnit(u, device, 'deployAltitude'));
    }
    return separationColumns(tree, t, (stage) => propAltitudeUnit(u, stage, 'separationAltitude'));
  }, [sub, tree, t, u]);

  const hint = {
    motors: 'configs.hint',
    recovery: 'configs.recoveryHint',
    separation: 'configs.separationHint',
    bays: 'configs.hint',
  }[sub];

  const flights = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of sims) out[s.configId] = (out[s.configId] ?? 0) + 1;
    return out;
  }, [sims]);

  const onDelete = async () => {
    if ((flights[selected.id] ?? 0) === 0 || (await confirmDelete(t('configs.deleteConfirm')))) {
      deleteConfig(selected.id);
    }
  };

  const bays = sub === 'bays';

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line/10 p-3">
        {!bays && (
          <>
            <ToolBtn onClick={addConfig}>{t('configs.new')}</ToolBtn>
            <ToolBtn onClick={() => copyConfig(selected.id)}>{t('configs.copy')}</ToolBtn>
            <ToolBtn
              onClick={() => void onDelete()}
              disabled={configs.length <= 1}
              title={configs.length <= 1 ? t('configs.deleteLast') : t('configs.delete')}
              danger
            >
              {t('configs.delete')}
            </ToolBtn>
          </>
        )}
        <nav aria-label={t('configs.title')} className="ml-auto flex items-center gap-1">
          <SubTab current={sub} value="motors" onClick={setSub}>
            {t('configs.motors')}
          </SubTab>
          <SubTab current={sub} value="recovery" onClick={setSub}>
            {t('configs.recovery')}
          </SubTab>
          <SubTab current={sub} value="separation" onClick={setSub}>
            {t('configs.separation')}
          </SubTab>
          <SubTab current={sub} value="bays" onClick={setSub}>
            {t('configs.bays')}
          </SubTab>
        </nav>
      </div>

      {bays ? (
        <div className="relative min-h-0 flex-1 overflow-auto">
          <RecoveryBaysPane />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <p className="px-3 py-2 text-[11px] leading-snug text-ink-faint">{t(hint)}</p>
          <ConfigsTable
            configs={configs}
            tree={tree}
            columns={columns}
            selectedId={selected.id}
            flights={flights}
            onSelect={onSelect}
          />
          {!desktop && (
            <div className="border-t border-line/10">
              <ConfigEditor />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubTab({
  current,
  value,
  onClick,
  children,
}: {
  current: ConfigsTab;
  value: ConfigsTab;
  onClick: (v: ConfigsTab) => void;
  children: React.ReactNode;
}) {
  return (
    <ToggleButton
      current
      active={current === value}
      onClick={() => onClick(value)}
      className="rounded-lg px-3 py-1.5 text-xs font-medium"
    >
      {children}
    </ToggleButton>
  );
}
