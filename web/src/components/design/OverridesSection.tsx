import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { UnitChip } from '../common/UnitChip';
import { useUnits } from '../../prefs/useUnits';
import { onSi } from '../../prefs/entryValue';
import { unitScope } from '../../prefs/units';
import { num } from '../../tree/nodeProps';
import { PANEL_SCOPE_KEYS } from '../../services/design/componentFields';
import { PropSection } from './PropSection';
import type { NodeEditProps } from './DimensionFields';
import { NumberWithUnit } from '../common/NumberRow';

function OverrideRow({
  label,
  unit,
  enabled,
  value,
  step,
  min,
  onToggle,
  onValue,
  onCommit,
  subLabel,
  sub,
  onSub,
  whole = false,
  coveredBy,
}: {
  label: string;
  unit?: ReactNode;
  enabled: boolean;
  value: number;
  step: number;
  min?: number;
  onToggle: (on: boolean) => void;
  /** `null` while the box is empty: a cleared box is not a typed 0. */
  onValue: (v: number | null) => void;
  onCommit?: () => void;
  subLabel: string;
  sub: boolean;
  onSub: (on: boolean) => void;
  whole?: boolean;
  coveredBy?: { note: string; tip: string };
}) {
  const locked = !!coveredBy;
  const showSub = enabled && !(whole && sub);
  return (
    <div className="space-y-1">
      <label className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={enabled}
            disabled={locked}
            title={coveredBy?.tip}
            onChange={(e) => {
              onToggle(e.target.checked);
              onCommit?.();
            }}
            className="accent-accent-500"
          />
          {label}
        </span>
        <NumberWithUnit
          unit={unit}
          fill="bg-raised text-ink-strong disabled:opacity-40"
          ariaLabel={label}
          value={Number.isFinite(value) ? value : 0}
          onChange={onValue}
          onCommit={onCommit}
          disabled={!enabled || locked}
          step={step}
          min={min}
        />
      </label>
      {coveredBy && (
        <p title={coveredBy.tip} className="pl-6 text-[11px] leading-snug text-danger-400">
          {coveredBy.note}
        </p>
      )}
      {showSub && (
        <label className="flex items-center gap-2 pl-6 text-[11px] text-ink-faint">
          <input
            type="checkbox"
            checked={sub}
            disabled={locked}
            onChange={(e) => {
              onSub(e.target.checked);
              onCommit?.();
            }}
            className="accent-accent-500"
          />
          {subLabel}
        </label>
      )}
    </div>
  );
}

const COVER_KEYS = {
  mass: ['override.massBy', 'override.massByTip'],
  cg: ['override.cgBy', 'override.cgByTip'],
  cd: ['override.cdBy', 'override.cdByTip'],
} as const;

const CONTAINERS: ReadonlySet<string> = new Set(['stage', 'parallelstage', 'podset']);

export function OverridesSection({
  node,
  onChange,
  onCommit,
  coveredBy = {},
}: NodeEditProps & {
  coveredBy?: Partial<Record<'mass' | 'cg' | 'cd', string>>;
}) {
  const { t } = useTranslation();
  const cover = (kind: 'mass' | 'cg' | 'cd') => {
    const name = coveredBy[kind];
    const [note, tip] = COVER_KEYS[kind];
    return name ? { note: t(note, { name }), tip: t(tip, { name }) } : undefined;
  };
  const u = useUnits();
  const massOverrideScope = unitScope('prop', node.type, PANEL_SCOPE_KEYS[0]);
  const cgOverrideScope = unitScope('prop', node.type, PANEL_SCOPE_KEYS[1]);
  const overrideMassUnit = u.at(massOverrideScope, 'mass');
  const overrideCgUnit = u.at(cgOverrideScope, 'length');
  // An imported .ork with a container's sub override off keeps it off until the user ticks it.
  const whole = CONTAINERS.has(node.type);
  const subOn = (current: unknown) => (whole ? true : current);

  return (
    <PropSection title={t('override.title')}>
      <OverrideRow
        label={t('override.mass')}
        unit={<UnitChip quantity="mass" scope={massOverrideScope} />}
        step={overrideMassUnit.step(0.0005)}
        // ComponentFactory.NON_NEGATIVE; desktop floors it at 0 (RocketComponentConfig).
        min={0}
        enabled={typeof node.overrideMass === 'number'}
        value={overrideMassUnit.toUi(num(node, 'overrideMass'))}
        onToggle={(on) =>
          onChange({
            overrideMass: on ? Math.max(num(node, 'overrideMass'), 0.01) : undefined,
            overrideSubcomponentsMass: on ? subOn(node.overrideSubcomponentsMass) : undefined,
          })
        }
        onValue={onSi(overrideMassUnit, (si) => si !== null && onChange({ overrideMass: si }))}
        onCommit={onCommit}
        subLabel={t('override.applyAll')}
        sub={node.overrideSubcomponentsMass === true}
        onSub={(on) => onChange({ overrideSubcomponentsMass: on || undefined })}
        whole={whole}
        coveredBy={cover('mass')}
      />
      <OverrideRow
        label={t(node.type === 'stage' ? 'override.cgStage' : 'override.cg')}
        unit={<UnitChip quantity="length" scope={cgOverrideScope} />}
        step={overrideCgUnit.step(0.001)}
        // Desktop's spinner floors the CG at 0 (RocketComponentConfig).
        min={0}
        enabled={typeof node.overrideCGX === 'number'}
        value={overrideCgUnit.toUi(num(node, 'overrideCGX'))}
        onToggle={(on) =>
          onChange({
            overrideCGX: on ? num(node, 'overrideCGX') : undefined,
            overrideSubcomponentsCG: on ? subOn(node.overrideSubcomponentsCG) : undefined,
          })
        }
        onValue={onSi(overrideCgUnit, (si) => si !== null && onChange({ overrideCGX: si }))}
        onCommit={onCommit}
        subLabel={t('override.applyAll')}
        sub={node.overrideSubcomponentsCG === true}
        onSub={(on) => onChange({ overrideSubcomponentsCG: on || undefined })}
        whole={whole}
        coveredBy={cover('cg')}
      />
      {/* No floor: a CD override may be negative (RocketComponent.setOverrideCD). */}
      <OverrideRow
        label={t('override.cd')}
        step={0.05}
        enabled={typeof node.overrideCD === 'number'}
        value={num(node, 'overrideCD')}
        onToggle={(on) =>
          onChange({
            overrideCD: on ? num(node, 'overrideCD') || 0.5 : undefined,
            overrideSubcomponentsCD: on ? subOn(node.overrideSubcomponentsCD) : undefined,
          })
        }
        onValue={(v) => v !== null && onChange({ overrideCD: v })}
        onCommit={onCommit}
        subLabel={t('override.applyAll')}
        sub={node.overrideSubcomponentsCD === true}
        onSub={(on) => onChange({ overrideSubcomponentsCD: on || undefined })}
        whole={whole}
        coveredBy={cover('cd')}
      />
      <p className="text-[11px] leading-snug text-ink-faint">{t('override.cpNote')}</p>
    </PropSection>
  );
}
