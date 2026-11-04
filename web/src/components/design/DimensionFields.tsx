import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { FieldLabel } from '../common/FieldMark';
import { UnitChip } from '../common/UnitChip';
import { useUnits, type FieldUnit } from '../../prefs/useUnits';
import { clampEntry } from '../../prefs/entryValue';
import { unitScope, type Quantity, degToRad } from '../../prefs/units';
import { num } from '../../tree/nodeProps';
import { shapeSelect } from '../../tree/shapeProfile';
import { FIELDS, type Field, type PanelSection } from '../../services/design/componentFields';
import { DERIVED } from '../../services/design/derivedFields';
import { clampToBounds, type DimensionBounds } from '../../services/design/linkedDimensions';
import {
  KERNEL_AUTO_KEYS,
  fieldApplies,
  fieldOptions,
  fieldRange,
  fieldValue,
  liveBounds,
} from '../../services/design/fieldRange';
import { parentRadiusOf } from '../../tree/finPlanform';
import { PropSection } from './PropSection';
import { rebaseTabOffset } from '../../tree/axialRebase';
import { useWorkspaceStore } from '../../state/store';
import { trimFloatNoise } from '../../services/app/numbers';
import { NumberWithUnit } from '../common/NumberRow';

// Memoized on the live build: each read is a kernel call and the panel re-renders per keystroke.
function useKernelAutoValue(node: ComponentNode, f: Field): number | undefined {
  const rocket = useWorkspaceStore((s) => s.rocket);
  const autoOn = !!f.auto && node[f.auto.flag] === true && KERNEL_AUTO_KEYS.has(f.key);
  const id = typeof node.id === 'string' ? node.id : null;
  return useMemo(() => {
    if (!autoOn || !rocket || id === null) return undefined;
    try {
      const v = (rocket.componentInfo(id) as unknown as Record<string, unknown>)[f.key];
      return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    } catch {
      // A part the live build does not hold yet (the rebuild trails the edit).
      return undefined;
    }
  }, [rocket, id, f.key, autoOn]);
}

// `FinSet.getMaxTabHeight()`: the parent's radius at the tab's ends, which no field bound can read.
function useTabDepthLimit(node: ComponentNode, f: Field): number | null {
  const id = f.key === 'tabHeight' && typeof node.id === 'string' ? node.id : null;
  return useWorkspaceStore((s) => (id === null ? null : parentRadiusOf(s.tree, id)));
}

export function visibleFields(node: ComponentNode, isFirstStage: boolean): Field[] {
  const allFields = node.type === 'stage' && isFirstStage ? [] : (FIELDS[node.type] ?? []);
  return allFields.filter((f) => f.section === undefined && fieldApplies(node, f));
}

export function sectionFields(node: ComponentNode, section: PanelSection): Field[] {
  return (FIELDS[node.type] ?? []).filter((f) => f.section === section && fieldApplies(node, f));
}

export function FieldSection({
  node,
  title,
  fields,
  onChange,
  onCommit,
  children,
}: {
  node: ComponentNode;
  title: string;
  fields: Field[];
  onChange: (patch: Partial<ComponentNode>) => void;
  onCommit?: () => void;
  children?: ReactNode;
}) {
  if (!fields.length) return null;
  return (
    <PropSection title={title}>
      {fields.map((f) => (
        <FieldRow key={f.key} node={node} field={f} onChange={onChange} onCommit={onCommit} />
      ))}
      {children}
    </PropSection>
  );
}

export const commitWith =
  (onChange: NodeEditProps['onChange'], onCommit?: () => void) =>
  (patch: Partial<ComponentNode>): void => {
    onChange(patch);
    onCommit?.();
  };

export interface NodeEditProps {
  node: ComponentNode;
  onChange: (patch: Partial<ComponentNode>) => void;
  onCommit?: () => void;
  /** Undefined outside a design, which offers every option. */
  stageBelow?: boolean;
}

export interface CommitEditProps {
  node: ComponentNode;
  onCommitChange: (patch: Partial<ComponentNode>) => void;
}

export function ShoulderSections({ node, onChange, onCommit }: NodeEditProps) {
  const { t } = useTranslation();
  return (
    <>
      {(
        [
          ['shoulder', t('prop.shoulder')],
          ['foreShoulder', t('prop.foreShoulder')],
          ['aftShoulder', t('prop.aftShoulder')],
        ] as const
      ).map(([section, title]) => (
        <FieldSection
          key={section}
          node={node}
          title={title}
          fields={sectionFields(node, section)}
          onChange={onChange}
          onCommit={onCommit}
        />
      ))}
    </>
  );
}

interface NumberFieldProps {
  label: string;
  unit?: ReactNode;
  value: number;
  step: number;
  min?: number;
  max?: number;
  required?: boolean;
  auto?: { on: boolean; label: string; title: string; onToggle: (on: boolean) => void };
  onChange: (v: number) => void;
  onCommit?: () => void;
}

export function NumberField({
  label,
  unit,
  value,
  step,
  min,
  max,
  required,
  auto,
  onChange,
  onCommit,
}: NumberFieldProps) {
  const { t } = useTranslation();
  const missing = required && !(Number.isFinite(value) && value > 0);
  // An empty required box writes nothing (blur restores it), but a typed 0 lands. Not a focus trap (WCAG 2.1.2).
  const write = (v: number | null) => {
    if (v === null && required) return;
    onChange(v ?? 0);
  };
  return (
    <div className="flex items-center justify-between gap-2">
      {/* Not one big <label>: a label binds one control, so "Auto" would focus the box. */}
      <label className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <FieldLabel text={label} required={required} missing={missing} />
        <NumberWithUnit
          className="shrink-0"
          unit={unit}
          missing={missing}
          fill={auto?.on ? 'bg-raised/50 text-ink-muted' : 'bg-raised text-ink-strong'}
          ariaLabel={label}
          value={Number.isFinite(value) ? value : 0}
          onChange={write}
          onCommit={onCommit}
          step={step}
          min={min}
          max={max}
          disabled={auto?.on}
        />
      </label>
      {/* The name leads with the field's so two Auto switches on one part are told apart. */}
      {auto && (
        <label
          title={auto.title}
          className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] leading-none text-ink-muted"
        >
          <input
            type="checkbox"
            checked={auto.on}
            onChange={(e) => auto.onToggle(e.target.checked)}
            aria-label={auto.label}
            className="accent-accent-500"
          />
          {t('prop.auto')}
        </label>
      )}
    </div>
  );
}

// Mirrors FinSet.setTabOffsetMethod (tab stays in place) and Transition.setShapeType (new parameter and clip).
function selectPatch(node: ComponentNode, key: string, value: string): Partial<ComponentNode> {
  if (key === 'tabOffsetMethod') return rebaseTabOffset(node, value);
  if (key === 'shape' && (node.type === 'nosecone' || node.type === 'transition')) return shapeSelect(node, value);
  return { [key]: value };
}

export function FieldRow({ node, field: f, onChange, onCommit, stageBelow }: NodeEditProps & { field: Field }) {
  const { t } = useTranslation();
  const u = useUnits();
  const kernelAuto = useKernelAutoValue(node, f);
  const tabDepth = useTabDepthLimit(node, f);
  const bounds: DimensionBounds | undefined = liveBounds(f, tabDepth);
  const label = t(`prop.${f.label}`);
  const scope = unitScope('prop', node.type, f.key);
  const commitChange = commitWith(onChange, onCommit);
  // All or nothing: a `derived` field writes a linked pair, and half a pair is worse than none.
  const patchNumber = (patch: Partial<ComponentNode>) => {
    if (Object.values(patch).some((v) => v === null || (typeof v === 'number' && !Number.isFinite(v)))) return;
    onChange(patch);
  };
  const autoProp = () =>
    f.auto
      ? {
          auto: {
            on: node[f.auto.flag] === true,
            label: `${label}: ${t('prop.auto')}`,
            title: t(`prop.${f.auto.tip}`),
            // Turning Auto off keeps the length it was showing, as desktop does.
            onToggle: (on: boolean) =>
              commitChange(
                on || kernelAuto === undefined
                  ? { [f.auto!.flag]: on }
                  : { [f.auto!.flag]: false, [f.key]: kernelAuto },
              ),
          },
        }
      : {};
  const numeric = (props: Omit<NumberFieldProps, 'label' | 'required' | 'onCommit'>) => (
    <NumberField label={label} required={f.required} onCommit={onCommit} {...props} />
  );
  const inUnit = (quantity: Quantity, stepSi: number, min?: (fu: FieldUnit) => number, maxSi?: number) => {
    const fu = u.at(scope, quantity);
    return numeric({
      unit: <UnitChip quantity={quantity} scope={scope} />,
      value: fu.toUi(Number(fieldValue(node, f))),
      step: fu.step(stepSi),
      min: min?.(fu),
      max: maxSi === undefined ? undefined : fu.toUi(maxSi),
      onChange: (v) => {
        const si = fu.toSi(v);
        patchNumber({ [f.key]: si === null || maxSi === undefined ? si : Math.max(-maxSi, Math.min(maxSi, si)) });
      },
    });
  };

  switch (f.kind) {
    case 'select': {
      const cur = String(fieldValue(node, f));
      return (
        <label className="flex items-center justify-between gap-3">
          <span className="shrink-0 text-xs text-ink-muted">{label}</span>
          <select
            value={cur}
            onChange={(e) => commitChange(selectPatch(node, f.key, e.target.value))}
            className="min-w-0 flex-1 rounded-md bg-raised px-2 py-1 text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
          >
            {fieldOptions(node, f, stageBelow).map((o) => (
              <option key={o} value={o}>
                {f.optLabel ? f.optLabel(o, t) : f.optI18n ? t(`${f.optI18n}.${o}`) : o}
              </option>
            ))}
          </select>
        </label>
      );
    }
    case 'text':
      return (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">{label}</span>
          <textarea
            rows={3}
            value={typeof node[f.key] === 'string' ? (node[f.key] as string) : ''}
            onChange={(e) => onChange({ [f.key]: e.target.value || undefined })}
            onBlur={onCommit}
            className="w-full resize-y rounded-md bg-raised px-2 py-1 text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
          />
        </label>
      );
    case 'bool':
      return (
        <label className="flex items-center justify-between gap-3">
          <span className="text-xs text-ink-muted">{label}</span>
          <input
            type="checkbox"
            checked={fieldValue(node, f) === true}
            onChange={(e) => commitChange({ [f.key]: e.target.checked })}
            className="accent-accent-500"
          />
        </label>
      );
    case 'count': {
      const { min = 1, max = 1 } = fieldRange(node, f);
      return numeric({
        value: Number(fieldValue(node, f)),
        step: 1,
        min,
        max,
        // Clamped at the source too, or it is persisted and exported unclamped.
        onChange: (v) => patchNumber({ [f.key]: Math.min(max, Math.max(min, Math.round(v))) }),
      });
    }
    case 'mass':
    case 'distance': {
      // The bridge refuses negatives (ComponentFactory NON_NEGATIVE); a negative separation altitude never fires.
      const { min } = fieldRange(node, f);
      const floor = min === undefined ? undefined : (fu: FieldUnit) => fu.toUi(min);
      return f.kind === 'mass' ? inUnit('mass', 0.0005, floor) : inUnit('distance', f.step ?? 10, floor);
    }
    case 'number': {
      const { min, max } = fieldRange(node, f);
      return numeric({
        unit: f.unitKey ? t(f.unitKey) : undefined,
        // On Auto, the kernel's value, not the stored one it ignores.
        value: kernelAuto ?? Number(fieldValue(node, f)),
        step: f.step ?? 0.1,
        min,
        max,
        ...autoProp(),
        onChange: (v) => patchNumber({ [f.key]: Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)) }),
      });
    }
    case 'angle': {
      // Stored in radians; the range is converted too.
      const { min, max } = fieldRange(node, f);
      return inUnit('angle', degToRad(f.step ?? 5), min === undefined ? undefined : (fu) => fu.toUi(min), max);
    }
    case 'bore': {
      // Not stored: writes the wall and keeps the outer radius, as OpenRocket's linked tube fields do.
      const fu = u.at(scope, 'length');
      const outerR = num(node, 'outerRadius');
      const od = 2 * outerR;
      return numeric({
        unit: <UnitChip quantity="length" scope={scope} />,
        value: fu.toUi(Math.max(0, od - 2 * num(node, 'thickness'))),
        step: fu.step(0.0005),
        min: 0,
        max: fu.toUi(od),
        onChange: (v) => {
          const si = fu.toSi(v);
          if (si === null) return;
          const bore = Math.max(0, Math.min(od, si));
          // Floored: unit round-trip dust gives walls like -1.7e-18.
          patchNumber({ thickness: Math.max(0, (od - bore) / 2) });
        },
      });
    }
    case 'derived': {
      const d = DERIVED[f.derived];
      const fu = d.quantity ? u.at(scope, d.quantity) : undefined;
      const patch = (v: number) => {
        const si = fu ? fu.toSi(v) : clampEntry(v);
        if (si === null) return;
        patchNumber(d.write(node, si));
      };
      const value = d.read(node);
      const bound = (v: number | undefined) => (v === undefined ? undefined : trimFloatNoise(fu ? fu.toUi(v) : v));
      return numeric({
        unit: d.quantity ? <UnitChip quantity={d.quantity} scope={scope} /> : undefined,
        value: fu ? fu.toUi(value) : value,
        // Snapped: the unit round trip turns 89 degrees into 89.00000000000001.
        min: bound(d.min?.(node) ?? 0),
        max: bound(d.max?.(node)),
        step: fu ? fu.step(f.step ?? 0.1) : (f.step ?? 0.1),
        onChange: patch,
      });
    }
    default: {
      // `diameter` fields are radii in the node and diameters in the box; the doubling lives only here.
      const fu = u.at(scope, 'length');
      const k = f.diameter ? 2 : 1;
      const { min, max } = fieldRange(node, f, bounds);
      const range = {
        ...(min === undefined ? {} : { min: fu.toUi(k * min) }),
        ...(max === undefined ? {} : { max: fu.toUi(k * max) }),
      };
      return numeric({
        unit: <UnitChip quantity="length" scope={scope} />,
        value: fu.toUi(k * (kernelAuto ?? Number(fieldValue(node, f)))),
        step: fu.step(0.0005),
        ...range,
        ...autoProp(),
        onChange: (v) => {
          const si = fu.toSi(v, (s) => s / k);
          patchNumber({ [f.key]: si === null ? si : clampToBounds(node, bounds, si) });
        },
      });
    }
  }
}
