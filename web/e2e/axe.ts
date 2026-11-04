import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from './base';
import type { Theme } from '../src/services/app/theme';
import type { AeroPane, ConfigsTab, Tool, TwoDView, ViewMode } from '../src/state/tabs';

const THEME_SET: Record<Theme, true> = { dark: true, light: true, daylight: true };
export const THEMES = Object.keys(THEME_SET) as Theme[];

export async function axeViolations(page: Page, where: string): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap((v) =>
    v.nodes.map((n) => {
      const colors = n.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined;
      const detail = colors?.contrastRatio
        ? ` (${colors.fgColor} on ${colors.bgColor}, ${colors.contrastRatio}:1)`
        : '';
      return `${where}: ${v.id}${detail} at ${n.target.join(' ')}`;
    }),
  );
}

export const VIEW: Record<ViewMode, string> = {
  '2d': '2D',
  '3d': '3D',
  drag: 'Aero',
  flight: 'Flight',
  path: '3D path',
  ground: 'Ground track',
  environment: 'Environment',
  card: 'Flight card',
};
export const TWO_D: Record<TwoDView, string> = { side: 'Side', aft: 'Aft' };
export const AERO_PANE: Record<AeroPane, string> = { charts: 'Charts', components: 'Per component' };
export const CONFIGS: Record<ConfigsTab, string> = {
  motors: 'Motors',
  recovery: 'Recovery',
  separation: 'Staging',
  bays: 'Bays',
};
export const TOOL: Record<Tool, string> = {
  landing: 'Landing estimator',
  chute: 'Parachute sizing',
  flutter: 'Fin flutter',
  ejection: 'Ejection charge',
  exhaust: 'Exhaust looks',
};

export async function press(page: Page, name: string): Promise<void> {
  const toggle = page.getByRole('button', { name, exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
}

export async function aeroChartsDrawn(page: Page): Promise<void> {
  await expect(page.getByRole('img', { name: /peak .* at Mach/ }).first()).toBeVisible({ timeout: 20_000 });
}
