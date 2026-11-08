import { useTranslation } from 'react-i18next';
import { canRemove, pastePlace } from '../../services/design/clipboard';
import { findMounts, findNode } from '../../services/design/treeEdit';
import { partLabel } from '../../i18n/format';
import { useWorkspaceStore } from '../../state/store';
import { confirm } from '../../state/confirmStore';

export interface TreeCommand {
  enabled: boolean;
  title: string;
  run: () => void;
}

export interface TreeCommands {
  cut: TreeCommand;
  copy: TreeCommand;
  paste: TreeCommand;
  duplicate: TreeCommand;
}

/** `at(id)` targets a focused, unselected row, as desktop acts on the row reached. */
export function useTreeEdit(): TreeCommands & { at: (id: string) => TreeCommands } {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const selectedId = useWorkspaceStore((s) => s.selectedId);
  const clipboard = useWorkspaceStore((s) => s.clipboard);
  const setSelectedId = useWorkspaceStore((s) => s.setSelectedId);
  const copySelected = useWorkspaceStore((s) => s.copySelected);
  const cutSelected = useWorkspaceStore((s) => s.cutSelected);
  const pasteClipboard = useWorkspaceStore((s) => s.pasteClipboard);
  const duplicateSelected = useWorkspaceStore((s) => s.duplicateSelected);

  const named = (key: string, keys: string) => `${t(key)} (${keys})`;
  const noSelection = t('tree.selectFirst');

  const commandsFor = (id: string | null): TreeCommands => {
    const node = id ? findNode(tree, id) : null;
    // The store's actions read the selection.
    const target = () => {
      if (id !== selectedId) setSelectedId(id);
    };

    const cutOk = !!node && !!id && canRemove(tree, id);
    const cut: TreeCommand = {
      enabled: cutOk,
      title: !node ? noSelection : cutOk ? named('tree.cut', 'Ctrl+X') : t('prop.lastStage'),
      run: () => {
        if (!cutOk) return;
        target();
        const onlyMount = node.motorMount === true && findMounts(tree).length === 1;
        if (!onlyMount) return cutSelected();
        void confirm({ message: t('warn.lastMountCut'), confirmLabel: t('tree.cut'), danger: true }).then(
          (ok) => ok && cutSelected(),
        );
      },
    };

    const copy: TreeCommand = {
      enabled: !!node,
      title: node ? named('tree.copy', 'Ctrl+C') : noSelection,
      run: () => {
        target();
        copySelected();
      },
    };

    const place = clipboard ? pastePlace(tree, clipboard, id) : null;
    const paste: TreeCommand = {
      enabled: !!place,
      title: !clipboard
        ? t('tree.pasteEmpty')
        : place
          ? named('tree.paste', 'Ctrl+V')
          : t('tree.pasteNowhere', {
              part: partLabel(t, clipboard),
              target: node ? partLabel(t, node) : t('tree.theDesign'),
            }),
      run: () => {
        target();
        pasteClipboard();
      },
    };

    const duplicate: TreeCommand = {
      enabled: !!node,
      title: node ? named('tree.duplicate', 'Ctrl+D') : noSelection,
      run: () => {
        target();
        duplicateSelected();
      },
    };

    return { cut, copy, paste, duplicate };
  };

  return { ...commandsFor(selectedId), at: commandsFor };
}
