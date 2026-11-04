import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComponentNode, FlightResult } from '../../engine/openRocketEngine';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { num } from '../../tree/nodeProps';
import { useWorkspaceStore, selectActive, selectConfig, selectOutdated } from '../../state/store';
import { motorSpecs } from '../../services/flight/flightConfigs';
import { deviceDescent, sharedDeviceNames, type RecoveryDeviceRef } from '../../services/flight/recoveryFlown';
import { isDefaultComponentName, kernelComponentName } from '../../services/app/warningText';
import { flightBranches } from '../../services/flight/flightColumns';
import { stageLabel } from '../../i18n/format';
import { airDensity, descentMass } from '../../services/flight/recoverySizing';
import { Dialog } from '../common/Dialog';
import { SizingFigures } from '../tools/SizingFigures';
import { commitWith, type NodeEditProps } from './DimensionFields';
import { smallButton } from '../common/smallButton';

export function RecoverySizingReadout({ node, onChange, onCommit }: NodeEditProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-line/5 pt-3">
      <button type="button" onClick={() => setOpen(true)} className={smallButton('sm', 'ink', 'w-full')}>
        {t('recovery.open')}
      </button>
      {open && (
        <Dialog
          id="recovery-sizing"
          title={t('recovery.title')}
          onClose={() => setOpen(false)}
          layer="over"
          layout="pad"
          size="md"
        >
          <SizingBody node={node} onUse={(d) => commitWith(onChange, onCommit)({ diameter: d })} />
        </Dialog>
      )}
    </div>
  );
}

function SizingBody({ node, onUse }: { node: ComponentNode; onUse: (diameterM: number) => void }) {
  const { t } = useTranslation();
  const u = useUnits();
  const massUnit = u.at(unitScope('recovery', 'mass'), 'mass');
  const info = useWorkspaceStore((s) => s.info);
  const tree = useWorkspaceStore((s) => s.tree);
  const config = useWorkspaceStore(selectConfig);
  const launch = useWorkspaceStore((s) => selectActive(s).launch);
  const result = useWorkspaceStore((s) => (selectOutdated(s) ? null : selectActive(s).result));

  // The kernel flies the stored Cd even on Auto (Parachute.getComponentCD), default 0.8.
  // Not `|| 0.8`, which would replace a stored 0.
  const cd = num(node, 'cd', 0.8);
  const diameter = num(node, 'diameter');

  // By name only for results without ids: an unnamed device shares the kernel default name.
  const device = useMemo(() => {
    const name = kernelComponentName(node);
    return { id: node.id, name, nameShared: sharedDeviceNames(tree.components).has(name) };
  }, [node, tree]);
  const sizing = useMemo(() => {
    const flown = deviceDescent(result, device);
    const mass = flown?.mass ?? descentMass(info?.mass, motorSpecs(tree, config));
    if (mass == null) return null;
    return {
      mass,
      rate: flown?.rate ?? null,
      measured: flown != null,
      branch: flown && result ? branchName(t, result, flown, device) : '',
    };
  }, [info?.mass, tree, config, result, device, t]);

  if (sizing == null) return <p className="mt-3 text-xs text-ink-muted">{t('recovery.needsMotor')}</p>;
  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs text-ink-muted">
        {/* Three keys: i18next cannot omit a fragment, and gluing would not translate. */}
        {t(
          sizing.measured ? (sizing.branch ? 'recovery.forMassRunBranch' : 'recovery.forMassRun') : 'recovery.forMass',
          { mass: `${massUnit.fmtSym(sizing.mass)}`, branch: sizing.branch },
        )}
      </p>
      <SizingFigures
        massKg={sizing.mass}
        cd={cd}
        rho={airDensity(launch)}
        diameterM={diameter > 0 ? diameter : null}
        rateMs={sizing.rate}
        onUse={onUse}
      />
    </div>
  );
}

// A cleared stage name flies under the kernel default, a bundle key TeaVM cannot look up.
function branchName(
  t: (key: string, opts?: Record<string, unknown>) => string,
  run: FlightResult,
  at: { branch: string; time: number },
  device: RecoveryDeviceRef,
): string {
  if (!at.branch) return '';
  const index = flightBranches(run).findIndex(
    (b) =>
      b.name === at.branch &&
      (b.events ?? []).some(
        (e) => e.time === at.time && (e.sourceId != null ? e.sourceId === device.id : e.source === device.name),
      ),
  );
  return stageLabel(t, Math.max(index, 0), isDefaultComponentName(at.branch) ? '' : at.branch);
}
