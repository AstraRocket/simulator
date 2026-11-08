import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { isAxial, hasMaterial, isRecoveryDevice } from '../../services/design/treeEdit';
import type { FitContext } from '../../services/parts/componentFilter';
import { AppearanceSection } from './AppearanceSection';
import { FreeformFinEditor } from './FreeformFinEditor';
import { RecoverySizingReadout } from './RecoverySizingReadout';
import { FinFlutterReadout } from './FinFlutterReadout';
import { ConfigOverrideNote } from './ConfigOverrideNote';
import { freeformPoints } from '../../tree/position';
import { FieldRow, FieldSection, ShoulderSections } from './DimensionFields';
import { commitWith, sectionFields, visibleFields } from './fieldHelpers';
import { CordMaterialSection, MaterialSection, RecoveryMaterialSection } from './MaterialSection';
import { StageRecovery } from './StageRecovery';
import { ComponentActions } from './ComponentActions';
import { AutoFinTabButton } from './AutoFinTabButton';
import { FreeformFinActions } from './FreeformFinActions';
import { OverridesSection } from './OverridesSection';
import { ShapeDescription } from './ShapeDescription';
import { PlacementSection } from './PlacementSection';
import { FilletSection, PanelHeader, PartSection, TubeFinCollision } from './PropertyPanelParts';

// Emits shallow patches; the tree is always SI and each field converts at the edge.

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
  const card = flush ? '' : ' rounded-xl bg-surface ring-1 ring-line/10';
  if (!node) {
    return <section className={`p-3 text-sm text-ink-faint${card}`}>{t('prop.selectHint')}</section>;
  }

  const fields = visibleFields(node, isFirstStage);
  // `shapeParameter` is hidden for some shapes, so anchor on whichever is last.
  const shapeAnchor = fields.filter((f) => f.key === 'shape' || f.key === 'shapeParameter').at(-1)?.key;
  const label = t(`part.${node.type}`, { defaultValue: node.type });
  const commitChange = commitWith(onChange, onCommit);

  return (
    <section className={`space-y-3 p-3${card}`}>
      <PanelHeader
        label={label}
        onRemove={onRemove}
        onMove={onMove}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        canRemove={canRemove}
      />

      <PartSection
        node={node}
        label={label}
        fit={fit}
        onChange={onChange}
        onCommit={onCommit}
        commitChange={commitChange}
      />

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

      <FilletSection node={node} onChange={onChange} onCommit={onCommit} commitChange={commitChange} />

      <TubeFinCollision node={node} parentRadius={parentRadius} />

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
