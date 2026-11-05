import { useTranslation } from 'react-i18next';
import type { ComponentPosition } from '../../engine/openRocketEngine';
import { UnitChip } from '../common/UnitChip';
import { useUnits } from '../../prefs/useUnits';
import { onSi } from '../../prefs/entryValue';
import { unitScope } from '../../prefs/units';
import { PANEL_SCOPE_KEYS } from '../../services/design/componentFields';
import { FieldRow, NumberField, commitWith, sectionFields, type NodeEditProps } from './DimensionFields';
import { PropSection } from './PropSection';
import { useWorkspaceStore } from '../../state/store';
import { findParent } from '../../services/design/treeEdit';
import { axialFrameOf, rebasePosition } from '../../tree/axialRebase';
import { axialLength } from '../../tree/position';
import { positionOf } from '../../tree/nodeProps';

// Rotation lives here: `FinSet.getBaseRotation()` is `getAngleOffset()`, one kernel property.
export function PlacementSection({ node, onChange, onCommit }: NodeEditProps) {
  const { t } = useTranslation();
  const u = useUnits();
  const offsetScope = unitScope('prop', node.type, PANEL_SCOPE_KEYS[2]);
  const offsetUnit = u.at(offsetScope, 'length');
  const pos = positionOf(node);
  const commitChange = commitWith(onChange, onCommit);

  const rotations = sectionFields(node, 'placement');

  // The offset is re-measured so the part stays put, as setAxialMethod does.
  const changeMethod = (method: ComponentPosition['method']) => {
    const tree = useWorkspaceStore.getState().tree;
    const parent = node.id ? findParent(tree, node.id) : null;
    const frame = parent?.id ? axialFrameOf(tree, parent.id) : null;
    commitChange({
      position: frame ? rebasePosition(pos, method, axialLength(node), frame) : { ...pos, method },
    });
  };

  return (
    <PropSection title={t('prop.placement')}>
      <label className="flex items-center justify-between gap-3">
        <span className="shrink-0 text-xs text-ink-muted">{t('prop.positionFrom')}</span>
        <select
          value={pos.method}
          onChange={(e) => changeMethod(e.target.value as ComponentPosition['method'])}
          className="min-w-0 flex-1 rounded-md bg-raised px-2 py-1 text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
        >
          {(['top', 'middle', 'bottom', 'absolute'] as const).map((m) => (
            <option key={m} value={m}>
              {t(`positionFrom.${m}`)}
            </option>
          ))}
        </select>
      </label>
      <NumberField
        label={t('prop.offset')}
        unit={<UnitChip quantity="length" scope={offsetScope} />}
        value={offsetUnit.toUi(pos.offset)}
        step={offsetUnit.step(0.001)}
        // Negative is legal; the bound is converted so it holds in inches.
        min={-offsetUnit.toUi(100)}
        onChange={onSi(offsetUnit, (si) => si !== null && onChange({ position: { ...pos, offset: si } }))}
        onCommit={onCommit}
      />
      {rotations.map((f) => (
        <FieldRow key={f.key} node={node} field={f} onChange={onChange} onCommit={onCommit} />
      ))}
    </PropSection>
  );
}
