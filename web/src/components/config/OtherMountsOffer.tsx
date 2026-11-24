import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComponentNode, MotorSpec } from '../../engine/openRocketEngine';
import { findMounts } from '../../services/design/treeEdit';
import { sameMotorSpec } from '../../services/flight/flightConfigs';
import { otherMountOffer } from '../../services/flight/otherMounts';
import { motorDesignation } from '../../services/motors/motorName';
import { useWorkspaceStore, selectEditedConfig } from '../../state/store';
import { partName } from './partName';

export interface PendingOffer {
  configId: string;
  fromId: string;
  spec: MotorSpec;
}

const buttonClass = 'rounded-lg bg-raised px-3 py-1.5 text-xs font-medium text-ink hover:bg-elevated';

/** Offered after a motor pick, never applied by itself; Undo puts back exactly what those mounts had. */
export function OtherMountsOffer({ pending, onDone }: { pending: PendingOffer; onDone: () => void }) {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const config = useWorkspaceStore(selectEditedConfig);
  const setMountMotors = useWorkspaceStore((s) => s.setMountMotors);
  const [loaded, setLoaded] = useState<{
    before: Record<string, MotorSpec | null>;
    after: Record<string, MotorSpec>;
  } | null>(null);
  const mounts = useMemo(() => findMounts(tree), [tree]);
  const name = (node: ComponentNode) =>
    partName(
      node,
      mounts.findIndex((m) => m.id === node.id),
      t,
    );
  const motor = motorDesignation(pending.spec);

  if (config.id !== pending.configId) return null;

  if (loaded) {
    // Gone once anything else changes those mounts: Undo would then put back the wrong thing.
    const holds = Object.entries(loaded.after).every(([id, m]) => {
      const seated = config.motors[id]?.spec;
      return !!seated && sameMotorSpec(seated, m);
    });
    if (!holds) return null;
    return (
      <div role="status" className="rounded-xl bg-surface p-3 text-xs ring-1 ring-accent-500/40">
        <p className="text-ink">{t('configs.otherMountsLoaded', { motor })}</p>
        <div className="mt-2 flex gap-2">
          <button
            className={buttonClass}
            onClick={() => {
              setMountMotors(pending.configId, loaded.before);
              onDone();
            }}
          >
            {t('configs.otherMountsUndo')}
          </button>
          <button className={buttonClass} onClick={onDone}>
            {t('configs.otherMountsClose')}
          </button>
        </div>
      </div>
    );
  }

  const seated = config.motors[pending.fromId]?.spec;
  if (!seated || !sameMotorSpec(seated, pending.spec)) return null;
  const { loads, skipped } = otherMountOffer(tree, config, pending.fromId, pending.spec);
  if (!loads.length) return null;

  return (
    <div role="status" className="rounded-xl bg-surface p-3 text-xs ring-1 ring-accent-500/40">
      <p className="text-ink">{t('configs.otherMountsOffer', { motor })}</p>
      <ul className="mt-1 list-disc pl-4 text-ink-muted">
        {loads.map((l) => (
          <li key={l.node.id as string}>
            {l.replaces
              ? t('configs.otherMountsReplaces', { mount: name(l.node), motor: motorDesignation(l.replaces) })
              : t('configs.otherMountsEmpty', { mount: name(l.node) })}
            {l.keptPlugged ? ` · ${t('configs.otherMountsKeptPlugged')}` : ''}
          </li>
        ))}
      </ul>
      {skipped.map((n) => (
        <p key={n.id as string} className="mt-1 text-ink-faint">
          {t('configs.otherMountsTooWide', { mount: name(n) })}
        </p>
      ))}
      <div className="mt-2 flex gap-2">
        <button
          className={buttonClass}
          onClick={() => {
            const before = Object.fromEntries(loads.map((l) => [l.node.id as string, l.replaces]));
            const after = Object.fromEntries(loads.map((l) => [l.node.id as string, l.spec]));
            setMountMotors(pending.configId, after);
            setLoaded({ before, after });
          }}
        >
          {t('configs.otherMountsLoad')}
        </button>
        <button className={buttonClass} onClick={onDone}>
          {t('configs.otherMountsDismiss')}
        </button>
      </div>
    </div>
  );
}
