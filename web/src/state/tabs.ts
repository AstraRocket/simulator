export type Tab = 'design' | 'configs' | 'sim' | 'results' | 'simple' | 'tools';

// Only used below lg.
export type DesignPane = 'stats' | 'sketch';

export type ConfigsTab = 'motors' | 'recovery' | 'separation' | 'bays';

/** In tab order. */
export const TOOLS = ['landing', 'chute', 'flutter', 'ejection', 'exhaust', 'motors'] as const;
export type Tool = (typeof TOOLS)[number];

export type AeroPane = 'charts' | 'components';

export type TwoDView = 'side' | 'aft';

export type ViewMode = '2d' | '3d' | 'drag' | 'flight' | 'path' | 'ground' | 'environment' | 'card';
export const DESIGN_VIEWS: readonly ViewMode[] = ['2d', '3d', 'drag'];
export const RESULT_VIEWS: readonly ViewMode[] = ['flight', 'path', 'ground', 'environment', 'card'];

export const isResultView = (view: ViewMode): boolean => RESULT_VIEWS.includes(view);
