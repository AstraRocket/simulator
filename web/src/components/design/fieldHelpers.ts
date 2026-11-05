import type { ComponentNode } from '../../engine/openRocketEngine';
import { FIELDS, type Field, type PanelSection } from '../../services/design/componentFields';
import { fieldApplies } from '../../services/design/fieldRange';
import type { NodeEditProps } from './DimensionFields';

export function visibleFields(node: ComponentNode, isFirstStage: boolean): Field[] {
  const allFields = node.type === 'stage' && isFirstStage ? [] : (FIELDS[node.type] ?? []);
  return allFields.filter((f) => f.section === undefined && fieldApplies(node, f));
}

export function sectionFields(node: ComponentNode, section: PanelSection): Field[] {
  return (FIELDS[node.type] ?? []).filter((f) => f.section === section && fieldApplies(node, f));
}

export const commitWith =
  (onChange: NodeEditProps['onChange'], onCommit?: () => void) =>
  (patch: Partial<ComponentNode>): void => {
    onChange(patch);
    onCommit?.();
  };
