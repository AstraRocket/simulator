import { useTranslation } from 'react-i18next';
import { toggleDaylight } from '../../services/app/theme';
import { useSettings } from '../../state/SettingsProvider';
import { ToggleButton } from '../common/ToggleButton';

/**
 * One tap between the chosen theme and daylight (high contrast), for a screen
 * read in sunlight at the field. Pressed while daylight is in force, whichever
 * way it was chosen (here or in Settings, General, Theme).
 */
export function DaylightToggle() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const on = settings.theme === 'daylight';
  const label = t('settings.themeOption.daylight');
  return (
    <ToggleButton
      active={on}
      onClick={() => update(toggleDaylight(settings.theme, settings.themeBeforeDaylight))}
      label={label}
      title={label}
      className="rounded-lg px-2 py-1.5 text-sm leading-none ring-1 ring-line/10 xl:px-2.5"
    >
      ☀︎
    </ToggleButton>
  );
}
