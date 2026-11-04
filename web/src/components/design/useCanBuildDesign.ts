import { useSettings } from '../../state/SettingsProvider';
import { useIsDesktop } from '../common/useMediaQuery';

export function useCanBuildDesign(): boolean {
  const desktop = useIsDesktop();
  const { settings } = useSettings();
  return desktop && !settings.maximizeCenter;
}
