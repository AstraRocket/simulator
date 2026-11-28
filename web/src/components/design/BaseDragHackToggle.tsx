import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { useWorkspaceStore } from '../../state/store';
import { Check } from '../common/Check';
import { useCanBuildDesign } from './useCanBuildDesign';

/**
 * A design-wide flag, not a part: the cone exists only in static builds and in a saved file. Shown in the aft-most
 * stage's editor, as the cone goes behind that stage.
 */
export function BaseDragHackToggle({ stage }: { stage: ComponentNode }) {
  const { t } = useTranslation();
  const on = useWorkspaceStore((s) => s.tree.baseDragHack === true);
  const aftMost = useWorkspaceStore((s) => s.tree.components.at(-1)?.id === stage.id);
  const updateDesignMeta = useWorkspaceStore((s) => s.updateDesignMeta);
  const canEdit = useCanBuildDesign();
  if (!canEdit || !aftMost) return null;
  return (
    <section className="border-t border-line/5 pt-3">
      <Check
        checked={on}
        onChange={(v) => updateDesignMeta({ baseDragHack: v ? true : undefined })}
        label={t('baseDragHack.label')}
        hint={t('baseDragHack.hint')}
        align="start"
      />
    </section>
  );
}
