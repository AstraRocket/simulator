import { useSettings } from '../../state/useSettings';

export function useViewPrefs() {
  const { settings, update, updateSection } = useSettings();
  const rulers = settings.rulers;
  const toggleMarkers = () => update({ showMarkers: !settings.showMarkers });
  const toggleInfoCard = () => update({ showInfoCard: !settings.showInfoCard });
  const toggleGrid = () => update({ showGrid: !settings.showGrid });
  const toggleRulerSide = (side: keyof typeof rulers) => updateSection('rulers', { [side]: !settings.rulers[side] });
  return {
    showMarkers: settings.showMarkers,
    showInfoCard: settings.showInfoCard,
    showGrid: settings.showGrid,
    rulers,
    toggleMarkers,
    toggleInfoCard,
    toggleGrid,
    toggleRulerSide,
  };
}
