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

/**
 * The property panel's override section: the mass / CG / CD overrides
 * (OpenRocket semantics), each an enable box, a value and an
 * "apply to all subcomponents" toggle.
 */

/** One override (mass / CG / CD): an enable checkbox + value, and, once enabled,
 *  an "apply to all subcomponents" toggle (OpenRocket's override-subtree flag). */
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
  /** The box's floor; absent, it takes any number. */
  min?: number;
  onToggle: (on: boolean) => void;
  /** `null` while the box is empty: a cleared box is not a typed 0. */
  onValue: (v: number | null) => void;
  onCommit?: () => void;
  subLabel: string;
  sub: boolean;
  onSub: (on: boolean) => void;
  /**
   * The part is only a container (a stage, boosters, pods): with no value of
   * its own to replace, its override is the whole subtree's, and the box is
   * shown only to let a design that has it off turn it on.
   */
  whole?: boolean;
  /** The note naming the ancestor whose override decides this value; the row is locked while it does. */
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

/** The note and its tooltip for each override an ancestor can decide (desktop's RocketCompCfg wording). */
const COVER_KEYS = {
  mass: ['override.massBy', 'override.massByTip'],
  cg: ['override.cgBy', 'override.cgByTip'],
  cd: ['override.cdBy', 'override.cdByTip'],
} as const;

/** The parts that only hold other parts: no mass, CG or drag of their own. */
const CONTAINERS: ReadonlySet<string> = new Set(['stage', 'parallelstage', 'podset']);

/** Mass / CG / CD overrides (OpenRocket semantics). A stage-level override
 *  with "all subcomponents" on is the usual way to pin a measured mass/CG. */
export function OverridesSection({
  node,
  onChange,
  onCommit,
  coveredBy = {},
}: NodeEditProps & {
  /** The ancestor whose override decides each value, by name. */
  coveredBy?: Partial<Record<'mass' | 'cg' | 'cd', string>>;
}) {
  const { t } = useTranslation();
  // Desktop's wording: a red note naming the ancestor, and its explanation on hover.
  const cover = (kind: 'mass' | 'cg' | 'cd') => {
    const name = coveredBy[kind];
    const [note, tip] = COVER_KEYS[kind];
    return name ? { note: t(note, { name }), tip: t(tip, { name }) } : undefined;
  };
  const u = useUnits();
  // The rows below the type-specific fields carry their own units too.
  const massOverrideScope = unitScope('prop', node.type, PANEL_SCOPE_KEYS[0]);
  const cgOverrideScope = unitScope('prop', node.type, PANEL_SCOPE_KEYS[1]);
  const overrideMassUnit = u.at(massOverrideScope, 'mass');
  const overrideCgUnit = u.at(cgOverrideScope, 'length');
  // A container has no mass, CG or drag of its own, so an override on one
  // that left its parts out would only add a lump beside them. Turned on, it
  // covers the parts; a design that arrives with it off (an imported .ork)
  // keeps its box until ticked, rather than changing under the user.
  const whole = CONTAINERS.has(node.type);
  const subOn = (current: unknown) => (whole ? true : current);

  return (
    <PropSection title={t('override.title')}>
      <OverrideRow
        label={t('override.mass')}
        unit={<UnitChip quantity="mass" scope={massOverrideScope} />}
        step={overrideMassUnit.step(0.0005)}
        // The bridge refuses a negative mass (ComponentFactory.NON_NEGATIVE)
        // and desktop's spinner floors it at 0 (RocketComponentConfig).
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
      {/* No floor: a drag coefficient override may be negative. Desktop's
          spinner runs -Infinity..Infinity (RocketComponentConfig) and
          RocketComponent.setOverrideCD stores any value. */}
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
