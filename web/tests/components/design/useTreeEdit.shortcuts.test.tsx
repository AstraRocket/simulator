// @vitest-environment jsdom
// cspell:ignore Strg -- German for Ctrl
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { useTreeEdit } from '../../../src/components/design/useTreeEdit';
import { useWorkspaceStore } from '../../../src/state/store';
import i18n from '../../../src/i18n';

const platform = (value: string) => vi.spyOn(navigator, 'platform', 'get').mockReturnValue(value);

function titles(): string[] {
  let out: string[] = [];
  function Probe() {
    const edit = useTreeEdit();
    out = [edit.copy.title, edit.duplicate.title];
    return null;
  }
  renderWithProviders(<Probe />);
  return out;
}

describe('the tree edit shortcut tooltips', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    useWorkspaceStore.getState().resetWorkspace();
    await i18n.changeLanguage('en');
  });

  const selectAPart = () => {
    const s = useWorkspaceStore.getState();
    s.setSelectedId(s.tree.components[0]!.children![0]!.id as string);
  };

  it('name Ctrl off Apple platforms', () => {
    platform('Win32');
    selectAPart();
    expect(titles()).toEqual(['Copy (Ctrl+C)', 'Duplicate (Ctrl+D)']);
  });

  it("use the keyboard's own key name, Strg in German, as undo does", async () => {
    platform('Win32');
    await i18n.changeLanguage('de');
    selectAPart();
    for (const title of titles()) expect(title).toMatch(/\(Strg\+[CD]\)$/);
  });

  it('show the Command key on a Mac, as undo does', () => {
    platform('MacIntel');
    selectAPart();
    expect(titles()).toEqual(['Copy (⌘C)', 'Duplicate (⌘D)']);
  });
});
