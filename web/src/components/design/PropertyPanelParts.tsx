import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { hasCatalog, catalogPatch, presetRef } from '../../services/design/treeEdit';
import type { PickerType } from '../../services/parts/componentDb';
import type { FitContext } from '../../services/parts/componentFilter';
const ComponentPicker = lazyNamed(() => import('./ComponentPicker'), 'ComponentPicker');
const SavePartButton = lazyNamed(() => import('./SavePartButton'), 'SavePartButton');
import { LazyBoundary } from '../common/ErrorBoundary';
import { lazyNamed } from '../common/lazyNamed';
import { Notice } from '../common/Notice';
import { useUnits } from '../../prefs/useUnits';
import { tubeFinCollision } from '../../tree/tubefins';
import { FieldSection } from './DimensionFields';
import { sectionFields } from './fieldHelpers';
import { MaterialSlotPicker } from './MaterialSection';
import { FILLET_MATERIAL_KEYS } from '../../services/design/materialSlots';
import { PropSection } from './PropSection';
import { PanelButton } from './PanelButton';
import { str } from '../../tree/nodeProps';
import { ringBoreNeedIn } from '../../services/design/discGeometry';
import { useWorkspaceStore } from '../../state/store';

type NodePatch = Partial<ComponentNode>;

export function PanelHeader({
  label,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
  canRemove,
}: {
  label: string;
  onRemove: () => void;
  onMove: ((dir: -1 | 1) => void) | undefined;
  canMoveUp: boolean | undefined;
  canMoveDown: boolean | undefined;
  canRemove: boolean;
}) {
  const { t } = useTranslation();
  return (
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
  );
}

export function PartSection({
  node,
  label,
  fit,
  onChange,
  onCommit,
  commitChange,
}: {
  node: ComponentNode;
  label: string;
  fit: FitContext | undefined;
  onChange: (patch: NodePatch) => void;
  onCommit: (() => void) | undefined;
  commitChange: (patch: NodePatch) => void;
}) {
  const { t } = useTranslation();
  const catalogPart = node['preset'] as { manufacturer?: string; partNo?: string } | undefined;
  return (
    <PropSection title={t('prop.part')}>
      <label className="flex items-center justify-between gap-3">
        <span className="shrink-0 text-xs text-ink-muted">{t('prop.name')}</span>
        <input
          type="text"
          value={str(node, 'name')}
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
  );
}

export function FilletSection({
  node,
  onChange,
  onCommit,
  commitChange,
}: {
  node: ComponentNode;
  onChange: (patch: NodePatch) => void;
  onCommit: (() => void) | undefined;
  commitChange: (patch: NodePatch) => void;
}) {
  const { t } = useTranslation();
  return (
    <FieldSection
      node={node}
      title={t('prop.fillet')}
      fields={sectionFields(node, 'fillet')}
      onChange={onChange}
      onCommit={onCommit}
    >
      <MaterialSlotPicker
        node={node}
        keys={FILLET_MATERIAL_KEYS}
        use="fillet"
        label={t('material.fillet')}
        onCommitChange={commitChange}
      />
    </FieldSection>
  );
}

/** Warns rather than clamps: the user may be mid-change. */
export function TubeFinCollision({ node, parentRadius }: { node: ComponentNode; parentRadius: number }) {
  const { t } = useTranslation();
  const u = useUnits();
  const collision = node.type === 'tubefinset' ? tubeFinCollision(node, parentRadius) : null;
  if (!collision) return null;
  return (
    <Notice tone="warn" size="fine">
      {t('prop.tubeFinsCollide', {
        max: collision.maxCount,
        // Doubled: the field shows a diameter.
        diameter: u.fmt('length', 2 * collision.maxRadius),
        unit: u.sym('length'),
      })}
    </Notice>
  );
}

export function RingBoreTooSmall({ node }: { node: ComponentNode }) {
  const { t } = useTranslation();
  const u = useUnits();
  const id = node.type === 'centeringring' && typeof node.id === 'string' ? node.id : null;
  const need = useWorkspaceStore((s) => (id === null ? null : ringBoreNeedIn(s.tree, id)));
  if (need === null) return null;
  return (
    <Notice tone="warn" size="fine">
      {t('prop.ringBoreTooSmall', { diameter: u.fmt('length', 2 * need), unit: u.sym('length') })}
    </Notice>
  );
}
