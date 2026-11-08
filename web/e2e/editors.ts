import { expect, openTab, type Page } from './base';
import type { ComponentType } from '../src/engine/openRocketEngine';
import en from '../src/i18n/locales/en.json' with { type: 'json' };

type EditorType = Exclude<ComponentType, 'fairing'>;

const EDITORS: Record<EditorType, 'default' | 'stage' | 'body'> = {
  stage: 'default',
  nosecone: 'default',
  bodytube: 'default',
  transition: 'stage',
  trapezoidfinset: 'default',
  ellipticalfinset: 'body',
  freeformfinset: 'body',
  tubefinset: 'body',
  innertube: 'default',
  tubecoupler: 'body',
  centeringring: 'default',
  bulkhead: 'body',
  engineblock: 'default',
  parachute: 'default',
  streamer: 'body',
  shockcord: 'default',
  launchlug: 'default',
  railbutton: 'body',
  masscomponent: 'default',
  podset: 'body',
  parallelstage: 'body',
};

const label = (type: EditorType): string => en.part[type];

// `dialog`: under `2xl` the editor is a modal over the tree, so it is closed before each click.
export async function eachEditor(
  page: Page,
  scan: (name: string) => Promise<void>,
  { dialog = false }: { dialog?: boolean } = {},
): Promise<void> {
  await openTab(page, 'Design');
  const tree = page.getByRole('tree', { name: 'Components' });
  const row = (type: EditorType) =>
    (type === 'stage' ? tree.locator('[aria-level="1"]') : tree.locator(`[title="${label(type)}"]`)).first();
  const editor = page.getByRole('dialog', { name: en.prop.editTitle });
  const shut = async () => {
    if (!dialog) return;
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
  };

  for (const type of Object.keys(EDITORS) as EditorType[]) {
    const from = EDITORS[type];
    if (from === 'default') {
      await row(type).click();
    } else {
      await row(from === 'stage' ? 'stage' : 'bodytube').click();
      await shut();
      await page.getByRole('combobox', { name: /^Add a part under/ }).selectOption(type);
    }
    await expect(page.getByRole('heading', { level: 2, name: label(type), exact: true })).toBeVisible();
    await scan(`${label(type)} editor`);
    await shut();
  }
}
