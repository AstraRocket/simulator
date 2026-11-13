import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IMAGE_WIDTHS, type ImageFormat } from '../../services/exports/schematicExport.js';
import { useMenuPopover } from '../common/useMenuPopover';
import { MenuPanel } from '../common/MenuPanel';
import { token } from '../common/colorTokens';

export interface ImageExportOptions {
  fit: boolean;
}

export function ImageExportMenu({
  icon,
  label,
  title,
  onPick,
  fitOption,
}: {
  icon?: string;
  label: string;
  title: string;
  onPick: (format: ImageFormat, widthPx: number, opts: ImageExportOptions) => void;
  fitOption?: boolean;
}) {
  const { t } = useTranslation();
  const { open, toggle, closeAndRestore, wrapRef, triggerRef, menuRef, onMenuKeyDown } = useMenuPopover();
  const [fit, setFit] = useState(true);

  const widthLabel = (w: number) => (w >= 7680 ? '8K' : w >= 3840 ? '4K' : 'HD');
  const formatName = (fmt: ImageFormat) => (fmt === 'png' ? 'PNG' : 'JPG');

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="file-btn"
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        ref={triggerRef}
        onClick={toggle}
      >
        {icon && <span aria-hidden>{`${icon} `}</span>}
        {label}
      </button>
      {open && (
        <MenuPanel
          menuRef={menuRef}
          onMenuKeyDown={onMenuKeyDown}
          className="grid grid-cols-[auto_repeat(3,auto)] gap-1 whitespace-nowrap p-1.5 text-xs"
        >
          {(['png', 'jpeg'] as ImageFormat[]).map((fmt) => [
            <span
              key={`${fmt}-label`}
              aria-hidden="true"
              style={{ alignSelf: 'center', padding: '0 6px', color: token('ink-muted') }}
            >
              {formatName(fmt)}
            </span>,
            ...IMAGE_WIDTHS.map((w) => (
              <button
                key={`${fmt}-${w}`}
                role="menuitem"
                tabIndex={-1}
                className="file-btn"
                title={t('export.pxWide', { width: w })}
                aria-label={t('export.imageOption', { format: formatName(fmt), size: widthLabel(w), width: w })}
                onClick={() => {
                  // Back to the trigger: the item holding focus unmounts.
                  closeAndRestore();
                  onPick(fmt, w, { fit: !!fitOption && fit });
                }}
              >
                {widthLabel(w)}
              </button>
            )),
          ])}
          {fitOption && (
            <label
              style={{
                gridColumn: '1 / -1',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 2,
                paddingTop: 5,
                borderTop: '1px solid var(--border, #444)',
                color: token('ink-muted'),
                cursor: 'pointer',
              }}
              title={t('export.fitFrameHint')}
            >
              <input
                type="checkbox"
                role="menuitemcheckbox"
                tabIndex={-1}
                aria-checked={fit}
                checked={fit}
                onChange={(e) => setFit(e.target.checked)}
              />
              {t('export.fitFrame')}
            </label>
          )}
        </MenuPanel>
      )}
    </div>
  );
}
