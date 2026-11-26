import { useTranslation } from 'react-i18next';

import { DESIGN_VIEWS, RESULT_VIEWS, type ViewMode } from '../../state/tabs';
import { GRAPHICS_OFF_KEY, graphics3d } from '../../services/app/graphics';
import { Segmented } from '../common/Segmented';

/** The views drawn with WebGL, disabled when the startup check turned 3D off. */
const WEBGL_VIEWS: readonly ViewMode[] = ['3d', 'path'];

export function ViewToggle({
  view,
  onChange,
  family,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
  family: 'design' | 'result';
}) {
  const { t } = useTranslation();
  const views = family === 'result' ? RESULT_VIEWS : DESIGN_VIEWS;
  const g = graphics3d();
  const off = (v: ViewMode) => !g.enabled && WEBGL_VIEWS.includes(v);
  return (
    <Segmented
      size="bar"
      options={views}
      value={view}
      onChange={onChange}
      fmt={(v) => t(`view.${v}`)}
      optionDisabled={off}
      title={(v) => (off(v) && g.reason ? t(GRAPHICS_OFF_KEY[g.reason]) : '')}
    />
  );
}
