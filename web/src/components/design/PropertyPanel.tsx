import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import {
  isAxial,
  hasCatalog,
  hasMaterial,
  catalogPatch,
  presetRef,
  isRecoveryDevice,
} from '../../services/design/treeEdit';
import type { PickerType } from '../../services/parts/componentDb';
import type { FitContext } from '../../services/parts/componentFilter';
const ComponentPicker = lazyNamed(() => import('./ComponentPicker'), 'ComponentPicker');
const SavePartButton = lazyNamed(() => import('./SavePartButton'), 'SavePartButton');
import { LazyBoundary, lazyNamed } from '../common/ErrorBoundary';
import { AppearanceSection } from './AppearanceSection';
import { FreeformFinEditor } from './FreeformFinEditor';
import { RecoverySizingReadout } from './RecoverySizingReadout';
import { FinFlutterReadout } from './FinFlutterReadout';
import { ConfigOverrideNote } from './ConfigOverrideNote';
import { useUnits } from '../../prefs/useUnits';
import { num } from '../../tree/nodeProps';
import { freeformPoints } from '../../tree/position';
import { tubeFinMaxCount, tubeFinMaxRadius } from '../../tree/tubefins';
import { FieldRow, FieldSection, ShoulderSections, commitWith, sectionFields, visibleFields } from './DimensionFields';
import { CordMaterialSection, MaterialSection, RecoveryMaterialSection } from './MaterialSection';
import { StageRecovery } from './StageRecovery';
import { ComponentActions } from './ComponentActions';
import { AutoFinTabButton } from './AutoFinTabButton';
import { FreeformFinActions } from './FreeformFinActions';
import { MaterialPicker } from './MaterialPicker';
import { OverridesSection } from './OverridesSection';
import { ShapeDescription } from './ShapeDescription';
import { PlacementSection } from './PlacementSection';
import { PropSection } from './PropSection';
import { PanelButton } from './PanelButton';

// Emits shallow patches; the tree is always SI and each field converts at the edge.

// The 1e-9 lets an exactly-touching (legal) set through.
function tubeFinsCollide(node: ComponentNode, parentRadius: number): boolean {
  if (!(parentRadius > 0)) return false;
  const max = tubeFinMaxRadius(num(node, 'finCount'), parentRadius);
  return max !== null && num(node, 'outerRadius') > max + 1e-9;
}

export function PropertyPanel({
  node,
  onChange,
  onCommit,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
  canRemove = true,
  isFirstStage = false,
  coveredBy,
  parentRadius = 0,
  fit,
  stageBelow,
  flush = false,
}: {
  node: ComponentNode | null;
  onChange: (patch: Partial<ComponentNode>) => void;
  onCommit?: () => void;
  onRemove: () => void;
  onMove?: (dir: -1 | 1) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  canRemove?: boolean;
  isFirstStage?: boolean;
  coveredBy?: Partial<Record<'mass' | 'cg' | 'cd', string>>;
  /** Meters. */
  parentRadius?: number;
  fit?: FitContext;
  stageBelow?: boolean;
  flush?: boolean;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const card = flush ? '' : ' rounded-xl bg-surface ring-1 ring-line/10';
  if (!node) {
    return <section className={`p-3 text-sm text-ink-faint${card}`}>{t('prop.selectHint')}</section>;
  }

  const fields = visibleFields(node, isFirstStage);
  // `shapeParameter` is hidden for some shapes, so anchor on whichever is last.
  const shapeAnchor = fields.filter((f) => f.key === 'shape' || f.key === 'shapeParameter').at(-1)?.key;
  const label = t(`part.${node.type}`, { defaultValue: node.type });
  const catalogPart = node['preset'] as { manufacturer?: string; partNo?: string } | undefined;
  const commitChange = commitWith(onChange, onCommit);

  return (
    <section className={`space-y-3 p-3${card}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</h2>
        <div className="flex items-center gap-1">
          {onMove && (
            <>
              <PanelButton
                onClick={() => onMove(-1)}
                disabled={!canMoveUp}
                title={t('prop.moveUp')}
                aria-label={t('prop.moveUp')}
              >
                ↑
              </PanelButton>
              <PanelButton
                onClick={() => onMove(1)}
                disabled={!canMoveDown}
                title={t('prop.moveDown')}
                aria-label={t('prop.moveDown')}
              >
                ↓
              </PanelButton>
            </>
          )}
          <button
            onClick={onRemove}
            disabled={!canRemove}
            title={canRemove ? t('prop.delete') : t('prop.lastStage')}
            className="rounded-md bg-danger-500/15 px-2 py-1 text-xs font-medium text-danger-300 ring-1 ring-danger-500/30 hover:bg-danger-500/25 disabled:cursor-not-allowed disabled:bg-raised disabled:text-ink-dim disabled:ring-line/10 disabled:hover:bg-raised"
          >
            {t('prop.delete')}
          </button>
        </div>
      </div>

      <PropSection title={t('prop.part')}>
        <label className="flex items-center justify-between gap-3">
          <span className="shrink-0 text-xs text-ink-muted">{t('prop.name')}</span>
          <input
            type="text"
            value={typeof node.name === 'string' ? node.name : ''}
            placeholder={label}
            onChange={(e) => onChange({ name: e.target.value })}
            onBlur={onCommit}
            className="min-w-0 flex-1 rounded-md bg-raised px-2 py-1 text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
          />
        </label>

        {catalogPart && (
          <div className="flex items-center justify-between gap-3">
            <span className="shrink-0 text-xs text-ink-muted">{t('prop.catalogPart')}</span>
            <span
              className="min-w-0 flex-1 truncate text-right text-sm text-ink"
              title={[catalogPart.manufacturer, catalogPart.partNo].filter(Boolean).join(' ')}
            >
              {catalogPart.partNo}
              <span className="block truncate text-[10px] text-ink-faint">{catalogPart.manufacturer}</span>
            </span>
          </div>
        )}

        {hasCatalog(node.type) && (
          <LazyBoundary fallback={<div className="text-xs text-ink-faint">{t('common.loading')}</div>}>
            <div className="space-y-2">
              <ComponentPicker
                type={node.type as PickerType}
                fit={fit}
                current={catalogPart}
                // The preset link goes in the same patch as the dimensions (see treeEdit.breaksPreset).
                onApply={(p) => commitChange({ ...catalogPatch(p, node), ...presetRef(p) })}
              />
              <SavePartButton node={node} type={node.type as PickerType} />
            </div>
          </LazyBoundary>
        )}
      </PropSection>

      {fields.map((f) => (
        <Fragment key={f.key}>
          <FieldRow node={node} field={f} onChange={onChange} onCommit={onCommit} stageBelow={stageBelow} />
          {f.key === shapeAnchor && <ShapeDescription node={node} />}
        </Fragment>
      ))}

      <ShoulderSections node={node} onChange={onChange} onCommit={onCommit} />

      <FieldSection
        node={node}
        title={t('prop.finTab')}
        fields={sectionFields(node, 'finTab')}
        onChange={onChange}
        onCommit={onCommit}
      >
        <AutoFinTabButton node={node} />
      </FieldSection>

      <FieldSection
        node={node}
        title={t('prop.fillet')}
        fields={sectionFields(node, 'fillet')}
        onChange={onChange}
        onCommit={onCommit}
      >
        <MaterialPicker
          use="fillet"
          label={t('material.fillet')}
          value={typeof node['filletMaterialName'] === 'string' ? node['filletMaterialName'] : undefined}
          density={typeof node['filletDensity'] === 'number' ? node['filletDensity'] : undefined}
          onChange={(name, d, group) =>
            commitChange({
              filletMaterialName: name,
              filletDensity: d || undefined,
              // Without the group the .ork writer files it under PaperProducts (the Cardboard fallback).
              filletMaterialGroup: (name && group) || undefined,
            })
          }
        />
      </FieldSection>

      {/* Warn rather than clamp: the user may be mid-change. */}
      {node.type === 'tubefinset' && tubeFinsCollide(node, parentRadius) && (
        <p className="rounded-md bg-warn-500/10 px-2 py-1.5 text-[11px] leading-snug text-warn-300 ring-1 ring-warn-500/30">
          {t('prop.tubeFinsCollide', {
            max: tubeFinMaxCount(num(node, 'outerRadius'), parentRadius),
            // Doubled: the field shows a diameter.
            diameter: u.fmt('length', 2 * (tubeFinMaxRadius(num(node, 'finCount'), parentRadius) ?? 0)),
            unit: u.sym('length'),
          })}
        </p>
      )}

      {hasMaterial(node.type) && <MaterialSection node={node} onCommitChange={commitChange} />}
      {node.type === 'shockcord' && <CordMaterialSection node={node} onCommitChange={commitChange} />}

      <FieldSection
        node={node}
        title={t('prop.motor')}
        fields={sectionFields(node, 'motor')}
        onChange={onChange}
        onCommit={onCommit}
      />

      {node.type === 'freeformfinset' && (
        <div className="border-t border-line/5 pt-3">
          {/* The kernel's outline, not the stored list: setPoints moves the first point and clamps to 2.5 m. */}
          <FreeformFinEditor
            points={freeformPoints(node)}
            onChange={(pts) => onChange({ points: pts })}
            onCommit={onCommit}
          />
          <FreeformFinActions node={node} />
        </div>
      )}

      {(node.type === 'trapezoidfinset' || node.type === 'ellipticalfinset' || node.type === 'freeformfinset') && (
        <FinFlutterReadout node={node} />
      )}

      {isRecoveryDevice(node.type) && (
        <>
          <ConfigOverrideNote node={node} />
          <RecoveryMaterialSection node={node} onCommitChange={commitChange} />
        </>
      )}

      {(node.type === 'stage' || node.type === 'parallelstage') && <ConfigOverrideNote node={node} />}

      {(node.type === 'stage' || node.type === 'parallelstage') && <StageRecovery node={node} />}

      {node.type === 'parachute' && <RecoverySizingReadout node={node} onChange={onChange} onCommit={onCommit} />}

      {node.type !== 'stage' && !isAxial(node.type) && (
        <PlacementSection node={node} onChange={onChange} onCommit={onCommit} />
      )}

      {node.type !== 'stage' && <AppearanceSection node={node} onCommitChange={commitChange} />}

      <ComponentActions node={node} />

      <OverridesSection node={node} onChange={onChange} onCommit={onCommit} coveredBy={coveredBy} />

      <FieldSection
        node={node}
        title={t('prop.comment')}
        fields={sectionFields(node, 'comment')}
        onChange={onChange}
        onCommit={onCommit}
      />
    </section>
  );
}
