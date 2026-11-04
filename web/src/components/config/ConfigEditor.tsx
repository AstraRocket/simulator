import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { findMounts, findRecoveryDevices, findSeparators, findStages } from '../../services/design/treeEdit';
import { useWorkspaceStore, selectEditedConfig } from '../../state/store';
import { MotorRow } from '../sim/MotorRow';
import { DeploymentSection } from './DeploymentSection';
import { SeparationSection } from './SeparationSection';
import { partName } from './ConfigsTable';
import { mountFit } from '../../services/motors/motorPicker';
import { mountIgnition, sameIgnition } from '../../services/flight/flightConfigs';

export function ConfigEditor() {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const config = useWorkspaceStore(selectEditedConfig);
  const configs = useWorkspaceStore((s) => s.configs);
  const setMountMotor = useWorkspaceStore((s) => s.setMountMotor);
  const setMountIgnition = useWorkspaceStore((s) => s.setMountIgnition);
  const renameConfig = useWorkspaceStore((s) => s.renameConfig);
  const commitConfigName = useWorkspaceStore((s) => s.commitConfigName);
  const onCommit = useWorkspaceStore((s) => s.commitEdit);
  const onError = useWorkspaceStore((s) => s.setErr);
  const flights = useWorkspaceStore((s) => s.sims.filter((x) => x.configId === config.id).length);

  const sub = useWorkspaceStore((s) => s.configsTab);
  const mounts = useMemo(() => findMounts(tree), [tree]);
  const devices = useMemo(() => findRecoveryDevices(tree), [tree]);
  const stages = useMemo(() => findStages(tree), [tree]);
  const separates = useMemo(() => new Set(findSeparators(tree).map((n) => n.id as string)), [tree]);

  return (
    <div className="space-y-4 p-3">
      <section className="rounded-xl bg-surface p-3 ring-1 ring-line/10">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-muted">{t('configs.name')}</div>
        <input
          value={config.name ?? ''}
          // Trimmed on commit, so a trailing space survives until the next word.
          onChange={(e) => renameConfig(config.id, e.target.value)}
          onBlur={() => commitConfigName(config.id)}
          onKeyDown={(e) => e.key === 'Enter' && commitConfigName(config.id)}
          placeholder={t('configs.namePlaceholder')}
          aria-label={t('configs.rename')}
          className="w-full rounded-md bg-raised px-2 py-1.5 text-sm font-medium text-ink-strong ring-1 ring-line/10 placeholder:font-normal placeholder:text-ink-faint focus:outline-none focus:ring-accent-500"
        />
        <p className="mt-2 text-[11px] leading-snug text-ink-faint">{t('configs.flownBy', { count: flights })}</p>
      </section>

      {sub === 'recovery' &&
        (devices.length ? (
          devices.map((d, i) => <DeploymentSection key={d.id as string} config={config} device={d} index={i} />)
        ) : (
          <p className="text-xs text-ink-faint">{t('configs.noRecovery')}</p>
        ))}

      {sub === 'separation' &&
        (stages.length ? (
          stages.map((st, i) => (
            <SeparationSection
              key={st.id as string}
              config={config}
              stage={st}
              index={i}
              separates={separates.has(st.id as string)}
            />
          ))
        ) : (
          <p className="text-xs text-ink-faint">{t('configs.noSeparation')}</p>
        ))}

      {sub === 'motors' &&
        mounts.map((mt, i) => {
          const id = mt.id as string;
          const seated = config.motors[id];
          const mount = mountFit(mt);
          const ignition = { event: seated?.ignitionEvent ?? 'automatic', delay: seated?.ignitionDelay ?? 0 };
          const target = { ignitionEvent: ignition.event, ignitionDelay: ignition.delay };
          return (
            <MotorRow
              // Keyed per configuration: a card's ignition scope belongs to it.
              key={`${config.id}:${id}`}
              title={mounts.length > 1 ? `${t('sims.motor')} - ${partName(mt, i, t)}` : undefined}
              motor={seated?.spec ?? null}
              onChange={(m) => setMountMotor(config.id, id, m)}
              liftoff={{ configId: config.id, mountId: id }}
              onError={onError}
              mount={mount}
              ignition={ignition}
              onIgnitionChange={(e, d, scope) => setMountIgnition(config.id, id, e, d, scope)}
              ignitionEverywhere={
                sameIgnition(mountIgnition(mt), target) &&
                configs.every((c) => !c.motors[id] || sameIgnition(c.motors[id], target))
              }
              onCommit={onCommit}
              used={configs.flatMap((c) => (c.id !== config.id && c.motors[id]?.spec ? [c.motors[id].spec] : []))}
            />
          );
        })}
    </div>
  );
}
