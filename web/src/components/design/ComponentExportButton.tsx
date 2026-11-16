import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { fireAction } from '../../state/fireAction';
import { useWorkspaceStore } from '../../state/store';
import { componentFormats, type ExportFormat } from '../../services/files/componentFormats';
import { useMenuPopover } from '../common/useMenuPopover';
import { MenuPanel } from '../common/MenuPanel';
import { useCapability } from '../common/useMediaQuery';
import type { Capability } from '../../services/app/capabilities';

const CAPABILITY: Record<ExportFormat, Capability> = {
  stl: 'export:part:stl',
  obj: 'export:part:obj',
  glb: 'export:part:glb',
  '3mf': 'export:part:3mf',
  dxf: 'export:part:dxf',
};

const LABEL: Record<ExportFormat, string> = {
  stl: 'file.stl',
  obj: 'file.obj',
  glb: 'file.glb',
  '3mf': 'file.3mf',
  dxf: 'file.dxf',
};

export function ComponentExportButton({ node, tabIndex }: { node: ComponentNode; tabIndex?: number }) {
  const { t } = useTranslation();
  const exportComponent = useWorkspaceStore((s) => s.exportComponent);
  const { open, toggle, closeAndRestore, wrapRef, triggerRef, menuRef, onMenuKeyDown } = useMenuPopover();

  const can = useCapability();

  const formats = componentFormats(node.type).filter((f) => can(CAPABILITY[f]));
  const id = node.id;
  if (formats.length === 0 || !id) return null;

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation(); // don't also select/deselect the row
          toggle();
        }}
        tabIndex={tabIndex}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('file.export')}
        title={t('file.export')}
        className="rounded px-1 text-sm leading-none text-ink-faint hover:bg-elevated hover:text-accent-300"
      >
        ⬇
      </button>
      {open && (
        <MenuPanel menuRef={menuRef} onMenuKeyDown={onMenuKeyDown} className="w-40 py-1">
          {formats.map((f) => (
            <button
              key={f}
              role="menuitem"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                closeAndRestore();
                fireAction(exportComponent(id, f));
              }}
              className="flex w-full items-center px-3 py-1.5 text-left text-xs font-medium text-ink hover:bg-elevated"
            >
              {t(LABEL[f])}
            </button>
          ))}
        </MenuPanel>
      )}
    </div>
  );
}
