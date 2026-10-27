import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { fireAction } from '../../state/fireAction';
import { useWorkspaceStore } from '../../state/store';
import { componentFormats, type ExportFormat } from '../../services/files/componentFormats';
import { useMenuPopover } from '../common/useMenuPopover';
import { useCapability } from '../common/useMediaQuery';
import type { Capability } from '../../services/app/capabilities';

/** The capability behind each format (services/app/capabilities.ts). */
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

/**
 * Per-component export affordance for a tree row: a small ⬇ button that drops
 * the formats this component supports (`componentFormats`: a nose cone or a
 * launch lug offers the mesh formats; a fin set, a centering ring or a bulkhead
 * offers the mesh formats and DXF). Renders nothing for parts with no
 * exportable object (parachute, streamer, shock cord, mass component, rail
 * button), so export sits only with the parts that can produce one. Each
 * format is a capability, so a phone or tablet offers only the ones
 * services/app/capabilities.ts allows it (GLB).
 */
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
        <div // eslint-disable-line jsx-a11y-x/interactive-supports-focus -- roving tabindex: focus moves to the items, as in the ARIA menu pattern, so the container is not
          role="menu"
          ref={menuRef}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-lg bg-raised py-1 shadow-xl ring-1 ring-line/10"
        >
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
        </div>
      )}
    </div>
  );
}
