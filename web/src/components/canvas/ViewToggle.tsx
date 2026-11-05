import { useTranslation } from 'react-i18next';

import { DESIGN_VIEWS, RESULT_VIEWS, type ViewMode } from '../../state/tabs';
import { Segmented } from '../common/Segmented';

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
  return <Segmented size="bar" options={views} value={view} onChange={onChange} fmt={(v) => t(`view.${v}`)} />;
}
