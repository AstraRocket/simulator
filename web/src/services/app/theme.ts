// "System" resolves here, not in a CSS media query: the 3D views only watch `data-theme`.

export type ThemePref = 'dark' | 'light' | 'system' | 'daylight';
export type Theme = 'dark' | 'light' | 'daylight';

export const THEME_PREFS: readonly ThemePref[] = ['dark', 'light', 'system', 'daylight'];

export type NonDaylightPref = Exclude<ThemePref, 'daylight'>;

export function toggleDaylight(
  theme: ThemePref,
  before: NonDaylightPref,
): { theme: ThemePref; themeBeforeDaylight: NonDaylightPref } {
  return theme === 'daylight'
    ? { theme: before, themeBeforeDaylight: before }
    : { theme: 'daylight', themeBeforeDaylight: theme };
}

const CHROME: Record<Theme, string> = { dark: '#0b1020', light: '#f1f5f9', daylight: '#ffffff' };

const systemDark = (): boolean =>
  typeof window === 'undefined' || !window.matchMedia
    ? true
    : window.matchMedia('(prefers-color-scheme: dark)').matches;

export function resolveTheme(pref: ThemePref): Theme {
  return pref === 'system' ? (systemDark() ? 'dark' : 'light') : pref;
}

export function applyTheme(pref: ThemePref): Theme {
  const theme = resolveTheme(pref);
  if (typeof document === 'undefined') return theme;
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[theme]);
  return theme;
}

export function followSystemTheme(pref: ThemePref): () => void {
  if (pref !== 'system' || typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => applyTheme('system');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
