import type { CommitEditProps } from './DimensionFields';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComponentType } from '../../engine/openRocketEngine';
import { colorForType, mergePalette } from '../../services/design/partColors';
import {
  alphaOf,
  defaultAppearance,
  INSIDE_COLOR_TYPES,
  opacityOf,
  readAppearance,
  SIDED_TYPES,
  type PartAppearance,
} from '../../services/design/appearance';
import { hexOf, parseHexColor } from '../../services/design/colorHex';
import { useSettings } from '../../state/useSettings';
import { readLineStyle } from '../../services/design/figureStyle';
import { figureToken } from '../../tree/schematicGeometry';
import { LineStyleRow } from './LineStyleRow';
import { PropSection } from './PropSection';
import { ColorField } from '../common/ColorInput';
import { Check } from '../common/Check';
import { NumberInput } from '../common/NumberInput';
import { Segmented } from '../common/Segmented';
import { roundTo } from '../../services/app/numbers';
import { tokenValues } from '../common/colorTokens';
import { useNativeChange } from '../common/useNativeChange';
import { PanelButton } from './PanelButton';

export function AppearanceSection({ node, onCommitChange }: CommitEditProps) {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const palette = useMemo(() => mergePalette(settings.partColors), [settings.partColors]);
  const hasInside = INSIDE_COLOR_TYPES.has(node.type);
  const sided = SIDED_TYPES.has(node.type);
  const separate = hasInside && node['separateInsideOutside'] === true;
  const [surface, setSurface] = useState<'outside' | 'inside'>('outside');
  const editing = separate ? surface : 'outside';
  const sideName = (s: 'outside' | 'inside') =>
    sided
      ? t(s === 'outside' ? 'prop.leftSide' : 'prop.rightSide')
      : t(s === 'outside' ? 'prop.outside' : 'prop.inside');

  const figureColor = typeof node.color === 'string' ? node.color : undefined;
  const saved = settings.figureStyles[node.type];
  // `ApplicationPreferences.setDefaultColor` / `setDefaultLineStyle`, then the part's own is cleared.
  const saveAsDefault = () => {
    const lineStyle = readLineStyle(node['lineStyle']);
    update({
      figureStyles: {
        ...settings.figureStyles,
        [node.type]: { ...saved, ...(figureColor ? { color: figureColor } : {}), ...(lineStyle ? { lineStyle } : {}) },
      },
    });
    onCommitChange({ color: undefined, lineStyle: undefined });
  };
  const key = editing === 'inside' ? 'insideAppearance' : 'appearance';
  const own = readAppearance(node[key]);
  const shown = own ?? defaultAppearance(node.type, palette);
  const set = (patch: Partial<PartAppearance>) => onCommitChange({ [key]: { ...shown, ...patch } });

  return (
    <PropSection title={t('prop.appearance')}>
      <SubHeading title={t('prop.figureStyle')} hint={t('prop.figureStyleHint')} />
      {/* As `AppearancePanel`: "Use default color" covers the line style too. */}
      <div className="flex items-center justify-between gap-3">
        <Check
          checked={figureColor === undefined}
          onChange={(v) =>
            onCommitChange(
              v
                ? { color: undefined, lineStyle: undefined }
                : { color: figureDefault(node.type, saved?.color), lineStyle: saved?.lineStyle },
            )
          }
          label={t('prop.useDefaultColor')}
          className="text-xs text-ink-muted"
        />
        <PanelButton disabled={figureColor === undefined} onClick={saveAsDefault} className="h-7">
          {t('prop.saveAsDefaultStyle')}
        </PanelButton>
      </div>
      <ColorRow
        label={t('prop.componentColor')}
        value={figureColor ?? figureDefault(node.type, saved?.color)}
        disabled={figureColor === undefined}
        onCommit={(color) => onCommitChange({ color })}
      />
      <LineStyleRow
        label={t('prop.componentLineStyle')}
        value={readLineStyle(node['lineStyle'])}
        disabled={figureColor === undefined}
        onCommit={(lineStyle) => onCommitChange({ lineStyle })}
      />

      <SubHeading title={t('prop.appearance3d')} hint={t('prop.appearance3dHint')} />
      {hasInside && (
        <>
          <Check
            checked={separate}
            onChange={(v) => onCommitChange({ separateInsideOutside: v || undefined })}
            label={t(sided ? 'prop.separateLeftRight' : 'prop.separateInsideOutside')}
            className="text-xs text-ink-muted"
            align="start"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-ink-muted">{t('prop.edgesAppearance')}</span>
            <Segmented
              options={['outside', 'inside'] as const}
              value={node['edgesSameAsInside'] === true ? 'inside' : 'outside'}
              onChange={(v) => onCommitChange({ edgesSameAsInside: v === 'inside' || undefined })}
              fmt={sideName}
              disabled={!separate}
            />
          </div>
          {separate && (
            <Segmented options={['outside', 'inside'] as const} value={surface} onChange={setSurface} fmt={sideName} />
          )}
        </>
      )}
      <Check
        checked={!own}
        onChange={(v) => onCommitChange({ [key]: v ? undefined : shown })}
        label={t('prop.useDefault')}
        className="text-xs text-ink-muted"
      />
      <ColorRow label={t('prop.color')} value={shown.paint} disabled={!own} onCommit={(paint) => set({ paint })} />
      <PercentRow label={t('prop.shine')} value={shown.shine} disabled={!own} onCommit={(shine) => set({ shine })} />
      <PercentRow
        label={t('prop.opacity')}
        value={opacityOf(shown)}
        disabled={!own}
        onCommit={(opacity) => set({ alpha: alphaOf(opacity) })}
      />
    </PropSection>
  );
}

function figureDefault(type: ComponentType, saved: string | undefined): string {
  if (saved) return saved;
  const name = figureToken(type);
  const n = parseHexColor(tokenValues()(name));
  return n === null ? colorForType(type) : hexOf(n);
}

function SubHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h4 className="text-xs font-medium text-ink-soft">{title}</h4>
      <p className="text-[11px] text-ink-muted">{hint}</p>
    </div>
  );
}

function ColorRow({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onCommit: (color: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const commitDraft = () => {
    const n = parseHexColor(draft);
    if (n === null || hexOf(n) === value) setDraft(value);
    else onCommit(hexOf(n));
  };
  return (
    <ColorField
      label={label}
      value={value}
      disabled={disabled}
      onCommit={onCommit}
      labelClassName="text-xs text-ink-muted"
    >
      <input
        type="text"
        value={draft}
        disabled={disabled}
        aria-label={`${label}, ${t('prop.hexColor')}`}
        placeholder={t('prop.hexColor')}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitDraft();
        }}
        className="w-20 rounded-md bg-raised px-2 py-1 font-mono text-xs text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500 disabled:bg-raised/50 disabled:text-ink-muted"
      />
    </ColorField>
  );
}

const pctOf = (v: number) => roundTo(v * 100, 1);

// Commits only when the number changed, so a rounded value is never written back.
function PercentRow({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onCommit: (v: number) => void;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useNativeChange(ref, (el) => {
    const v = Number(el.value) / 100;
    setDrag(null);
    if (pctOf(v) !== pctOf(value)) onCommit(v);
  });
  const shown = drag ?? value;
  return (
    <div className="flex items-center justify-between gap-3">
      {/* The slider is a duplicate control, kept out of the tab order and a11y tree. */}
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="flex items-center gap-2">
        <input
          ref={ref}
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(shown * 100)}
          disabled={disabled}
          aria-hidden
          tabIndex={-1}
          onChange={(e) => setDrag(Number(e.target.value) / 100)}
          className="w-24 accent-accent-500 disabled:opacity-40"
        />
        <NumberInput
          value={pctOf(shown)}
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          commitOnBlur
          ariaLabel={label}
          onChange={(v) => {
            if (v !== null && v !== pctOf(value)) onCommit(v / 100);
          }}
          className="w-16 rounded-md bg-raised px-2 py-1 text-right text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500 disabled:bg-raised/50 disabled:text-ink-muted"
        />
        <span className="text-xs text-ink-faint">%</span>
      </span>
    </div>
  );
}
