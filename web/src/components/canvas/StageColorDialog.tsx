import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  defaultBranchColor,
  defaultGroundColor,
  defaultPinColor,
  hexToRgbInt,
  rgbToHex,
} from '../../services/exports/flightPathExport';
import { Dialog } from '../common/Dialog';
import { stageLabel } from '../../i18n/format';
import { DialogButton, DialogActions } from '../common/DialogButton';

const COLOR_ROLES = ['path', 'ground', 'pin'] as const;
type ColorRole = (typeof COLOR_ROLES)[number];

const ROLE_DEFAULT: Record<ColorRole, (index: number) => number> = {
  path: defaultBranchColor,
  ground: defaultGroundColor,
  pin: defaultPinColor,
};

const ROLE_LABEL: Record<ColorRole, string> = {
  path: 'pathExport.colorRolePath',
  ground: 'pathExport.colorRoleGround',
  pin: 'pathExport.colorRolePin',
};

// Reset clears overrides rather than writing palette colors in, so unchosen stages keep following the palette.
export function StageColorDialog({
  names,
  colors,
  groundColors,
  pinColors,
  onApply,
  onCancel,
}: {
  names: string[];
  colors: Map<number, number>;
  groundColors: Map<number, number>;
  pinColors: Map<number, number>;
  onApply: (colors: Map<number, number>, groundColors: Map<number, number>, pinColors: Map<number, number>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<Record<ColorRole, Map<number, number>>>(() => ({
    path: new Map(colors),
    ground: new Map(groundColors),
    pin: new Map(pinColors),
  }));

  const setColor = (role: ColorRole, i: number, rgb: number) =>
    setDrafts((d) => {
      const next = new Map(d[role]);
      next.set(i, rgb);
      return { ...d, [role]: next };
    });

  return (
    <Dialog
      id="pathExportColors"
      title={t('pathExport.stageColorsTitle')}
      onClose={onCancel}
      layer="over"
      size="sm"
      layout="pad"
      expandable={false}
    >
      <>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 pb-1">
            <span className="flex-1" />
            {COLOR_ROLES.map((role) => (
              <span key={role} className="w-12 shrink-0 text-center text-[10px] uppercase tracking-wide text-ink-muted">
                {t(ROLE_LABEL[role])}
              </span>
            ))}
          </div>
          {names.map((name, i) => {
            const stage = stageLabel(t, i, name);
            return (
              <div key={`${i}-${name}`} className="flex items-center justify-between gap-2">
                <span className="flex-1 truncate text-sm text-ink-soft">{stage}</span>
                {COLOR_ROLES.map((role) => (
                  <input
                    key={role}
                    type="color"
                    aria-label={t('pathExport.stageColorLabel', { stage, role: t(ROLE_LABEL[role]) })}
                    value={rgbToHex(drafts[role].get(i) ?? ROLE_DEFAULT[role](i))}
                    onChange={(e) => setColor(role, i, hexToRgbInt(e.target.value))}
                    className="h-7 w-12 shrink-0 cursor-pointer rounded-md bg-raised ring-1 ring-line/10"
                  />
                ))}
              </div>
            );
          })}
        </div>
        <DialogActions>
          <button
            type="button"
            onClick={() => setDrafts({ path: new Map(), ground: new Map(), pin: new Map() })}
            className="mr-auto rounded-lg bg-raised px-3 py-2 text-xs text-ink-soft ring-1 ring-line/10 hover:bg-elevated"
          >
            {t('pathExport.resetColors')}
          </button>
          <DialogButton onClick={onCancel} variant="secondary">
            {t('pathExport.cancel')}
          </DialogButton>
          <DialogButton onClick={() => onApply(drafts.path, drafts.ground, drafts.pin)} variant="primary">
            {t('pathExport.apply')}
          </DialogButton>
        </DialogActions>
      </>
    </Dialog>
  );
}
