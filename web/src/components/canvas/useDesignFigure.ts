import { useMemo } from 'react';
import { useWorkspaceStore, selectConfig, selectMotorDims } from '../../state/store';
import { useSettings } from '../../state/useSettings';
import { withFigureDefaults } from '../../services/design/figureStyle';

/** `tree` carries the figure styles; `design` is the stored tree, for what styles must not reach. */
export function useDesignFigure() {
  const design = useWorkspaceStore((s) => s.tree);
  const config = useWorkspaceStore(selectConfig);
  const { settings } = useSettings();
  const tree = useMemo(() => withFigureDefaults(design, settings.figureStyles), [design, settings.figureStyles]);
  const motors = useMemo(() => selectMotorDims(design, config), [design, config]);
  return { design, config, tree, motors };
}
