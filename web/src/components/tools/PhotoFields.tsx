import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  rgbaHex,
  type BackgroundType,
  type PhotoSettings,
  type Rgba,
  type SkyId,
} from '../../services/design/photoSettings';
import { parseHexColor, rgbChannels } from '../../services/design/colorHex';
import { roundTo } from '../../services/app/numbers';
import { useUnits } from '../../prefs/useUnits';
import { unitScope, type Quantity } from '../../prefs/units';
import { NumberInput } from '../common/NumberInput';
import { UnitChip } from '../common/UnitChip';
import { SelectRow } from '../common/SelectRow';
import { Check } from '../common/Check';
import { ColorField } from '../common/ColorInput';
import { useNativeChange } from '../common/useNativeChange';
import { useFilePick } from '../common/useFilePick';
import { StatusLine } from '../common/StatusLine';
import { PanelButton } from '../design/PanelButton';
import {
  customBackground,
  clearCustomBackground,
  setCustomBackground,
  subscribeCustomBackground,
} from '../canvas/photo/customBackground';

type Edit = (patch: Partial<PhotoSettings>, final?: boolean) => void;

/** How a row shows its value: in the user's unit, as a percentage, or as is. */
type Shown = { quantity: Quantity } | 'percent' | 'plain';

const FIELD =
  'w-20 rounded-md bg-raised px-2 py-1 text-right text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500 disabled:bg-raised/50 disabled:text-ink-muted';

/** A number with a slider over desktop's range; the slider writes when let go, the box when left. */
function NumberRow({
  label,
  name,
  value,
  min,
  max,
  shown,
  disabled,
  onEdit,
}: {
  label: string;
  /** Its own unit override, as each desktop spinner has. */
  name: string;
  value: number;
  min: number;
  max: number;
  shown: Shown;
  disabled?: boolean;
  onEdit: (si: number, final: boolean) => void;
}) {
  const u = useUnits();
  const scope = unitScope('photo', name);
  const fu = typeof shown === 'object' ? u.at(scope, shown.quantity) : null;
  const k = shown === 'percent' ? 100 : 1;
  const toUi = (si: number) => (fu ? fu.toUi(si) : si * k);
  const toSi = (ui: number) => (fu ? fu.toSi(ui) : ui / k);
  const ui = roundTo(toUi(value), 3);
  const lo = toUi(min);
  const hi = toUi(max);
  const slider = useRef<HTMLInputElement>(null);
  useNativeChange(slider, (el) => {
    const si = toSi(Number(el.value));
    if (si !== null) onEdit(si, true);
  });
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-muted">{label}</span>
        <span className="flex items-center gap-1">
          <NumberInput
            value={ui}
            step={(hi - lo) / 100}
            disabled={disabled}
            commitOnBlur
            ariaLabel={label}
            onChange={(v) => {
              const si = v === null ? null : toSi(v);
              if (si !== null && v !== ui) onEdit(si, true);
            }}
            className={FIELD}
          />
          {fu && typeof shown === 'object' ? (
            <UnitChip quantity={shown.quantity} scope={scope} label={label} />
          ) : shown === 'percent' ? (
            <span className="text-xs text-ink-faint">%</span>
          ) : null}
        </span>
      </div>
      {/* The slider repeats the box, so it stays out of the tab order and the a11y tree. */}
      <input
        ref={slider}
        type="range"
        min={lo}
        max={hi}
        step={(hi - lo) / 500}
        value={Math.min(hi, Math.max(lo, toUi(value)))}
        disabled={disabled}
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const si = toSi(Number(e.target.value));
          if (si !== null) onEdit(si, false);
        }}
        className="w-full accent-accent-500 disabled:opacity-40"
      />
    </div>
  );
}

function ColorRow({
  label,
  value,
  disabled,
  onEdit,
}: {
  label: string;
  value: Rgba;
  disabled?: boolean;
  onEdit: (c: Rgba) => void;
}) {
  return (
    <ColorField
      label={label}
      value={rgbaHex(value)}
      disabled={disabled}
      labelClassName="text-xs text-ink-muted"
      onCommit={(hex) => {
        const n = parseHexColor(hex);
        if (n !== null) onEdit([...rgbChannels(n), value[3]]);
      }}
    />
  );
}

/**
 * A picture of the user's own behind the rocket, one button away. Desktop has no such background, so it changes
 * nothing in the design and lasts only for this session.
 */
function CustomImageButton() {
  const { t } = useTranslation();
  const custom = useSyncExternalStore(subscribeCustomBackground, customBackground);
  const [error, setError] = useState<string | null>(null);
  const file = useFilePick({
    accept: 'image/*',
    label: t('photo.customChoose'),
    onFile: (f) => {
      setError(null);
      setCustomBackground(f).catch(() => setError(t('photo.customUnreadable')));
    },
  });
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <PanelButton onClick={file.pick} className="shrink-0">
          {t('photo.customChoose')}
        </PanelButton>
        {custom.texture && (
          <>
            <span className="min-w-0 flex-1 truncate text-xs text-ink-muted" title={custom.name ?? undefined}>
              {custom.name}
            </span>
            <PanelButton onClick={clearCustomBackground} className="shrink-0">
              {t('photo.customClear')}
            </PanelButton>
          </>
        )}
        {file.input}
      </div>
      {custom.texture && <p className="text-[11px] leading-snug text-ink-faint">{t('photo.customHint')}</p>}
      <StatusLine tone="warn" size="fine">
        {error}
      </StatusLine>
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mt-1 border-b border-line/10 pb-0.5 text-xs font-semibold text-ink-soft">{children}</h3>;
}

const PI = Math.PI;

/** Desktop `PhotoSettingsConfig`'s three tabs. */
export function PhotoFields({
  tab,
  s,
  edit,
  hasMotors,
  span,
  backgrounds,
  skies,
}: {
  tab: 'orientation' | 'environment' | 'effects';
  s: PhotoSettings;
  edit: Edit;
  hasMotors: boolean;
  /** The rocket's length, which sets the advance and distance sliders' reach. */
  span: number;
  backgrounds: readonly BackgroundType[];
  skies: readonly SkyId[];
}) {
  const { t } = useTranslation();
  const custom = useSyncExternalStore(subscribeCustomBackground, customBackground);
  const num = (key: keyof PhotoSettings, min: number, max: number, shown: Shown, disabled?: boolean) => (
    <NumberRow
      label={t(`photo.${key}`)}
      name={key}
      value={s[key] as number}
      min={min}
      max={max}
      shown={shown}
      disabled={disabled}
      onEdit={(v, final) => edit({ [key]: v }, final)}
    />
  );
  const angle = { quantity: 'angle' as const };
  const length = { quantity: 'length' as const };

  if (tab === 'orientation') {
    return (
      <div className="flex flex-col gap-2">
        <Heading>{t('photo.rocket')}</Heading>
        {num('pitch', 0, 2 * PI, angle)}
        {num('yaw', 0, 2 * PI, angle)}
        {num('roll', 0, 2 * PI, angle)}
        {num('advance', -span, span, length)}
        <Heading>{t('photo.camera')}</Heading>
        {num('viewAz', 0, 2 * PI, angle)}
        {num('viewAlt', -PI, PI, angle)}
        {num('viewDistance', 0, 2 * span, length)}
        {num('fov', (10 * PI) / 180, (160 * PI) / 180, angle)}
      </div>
    );
  }

  if (tab === 'environment') {
    return (
      <div className="flex flex-col gap-2">
        <Heading>{t('photo.light')}</Heading>
        <ColorRow label={t('photo.sunlight')} value={s.sunlight} onEdit={(sunlight) => edit({ sunlight })} />
        {num('lightStrength', 0, 2, 'percent')}
        {num('ambiance', 0, 1, 'percent')}
        {num('lightAz', -PI, PI, angle)}
        {num('lightAlt', -PI / 2, PI / 2, angle)}
        <Heading>{t('photo.background')}</Heading>
        <CustomImageButton />
        {!custom.active && (
          <SelectRow<BackgroundType>
            label={t('photo.backgroundType')}
            value={s.backgroundType}
            onChange={(backgroundType) => edit({ backgroundType })}
          >
            {backgrounds.map((b) => (
              <option key={b} value={b}>
                {t(`photo.background_${b}`)}
              </option>
            ))}
          </SelectRow>
        )}
        {!custom.active && s.backgroundType === 'SOLID_COLOR' && (
          <>
            <ColorRow label={t('photo.skyColor')} value={s.skyColor} onEdit={(skyColor) => edit({ skyColor })} />
            <NumberRow
              label={t('photo.skyOpacity')}
              name="skyOpacity"
              value={s.skyColor[3] / 255}
              min={0}
              max={1}
              shown="percent"
              onEdit={(v, final) => edit({ skyColor: [...s.skyColor.slice(0, 3), Math.trunc(v * 255)] as Rgba }, final)}
            />
          </>
        )}
        {!custom.active && s.backgroundType === 'GRADIENT' && (
          <>
            <ColorRow
              label={t('photo.gradientTop')}
              value={s.gradientTopColor}
              onEdit={(gradientTopColor) => edit({ gradientTopColor })}
            />
            <ColorRow
              label={t('photo.gradientBottom')}
              value={s.gradientBottomColor}
              onEdit={(gradientBottomColor) => edit({ gradientBottomColor })}
            />
          </>
        )}
        {!custom.active && s.backgroundType === 'TEXTURE' && (
          <SelectRow label={t('photo.sky')} value={s.sky ?? ''} onChange={(v) => edit({ sky: v ? v : null })}>
            {skies.map((id) => (
              <option key={id} value={id}>
                {t(`photo.sky_${id}`)}
              </option>
            ))}
          </SelectRow>
        )}
      </div>
    );
  }

  const off = !hasMotors;
  return (
    <div className="flex flex-col gap-2">
      {off && <p className="text-[11px] italic text-ink-muted">{t('photo.noMotors')}</p>}
      {num('exhaustScale', 0, 10, 'percent', off || !(s.smoke || s.flame || s.sparks))}
      <Heading>{t('photo.smoke')}</Heading>
      <Check
        checked={s.smoke}
        disabled={off}
        onChange={(smoke) => edit({ smoke })}
        label={t('photo.enabled')}
        className="text-xs text-ink-muted"
      />
      <ColorRow
        label={t('photo.smokeColor')}
        value={s.smokeColor}
        disabled={off || !s.smoke}
        onEdit={(smokeColor) => edit({ smokeColor })}
      />
      <NumberRow
        label={t('photo.smokeOpacity')}
        name="smokeOpacity"
        value={s.smokeColor[3] / 255}
        min={0}
        max={1}
        shown="percent"
        disabled={off || !s.smoke}
        onEdit={(v, final) => edit({ smokeColor: [...s.smokeColor.slice(0, 3), Math.trunc(v * 255)] as Rgba }, final)}
      />
      <Heading>{t('photo.flame')}</Heading>
      <Check
        checked={s.flame}
        disabled={off}
        onChange={(flame) => edit({ flame })}
        label={t('photo.enabled')}
        className="text-xs text-ink-muted"
      />
      <ColorRow
        label={t('photo.flameColor')}
        value={s.flameColor}
        disabled={off || !s.flame}
        onEdit={(flameColor) => edit({ flameColor })}
      />
      {num('flameAspectRatio', 0.25, 2.5, 'percent', off || !s.flame)}
      <Heading>{t('photo.sparks')}</Heading>
      <Check
        checked={s.sparks}
        disabled={off}
        onChange={(sparks) => edit({ sparks })}
        label={t('photo.enabled')}
        className="text-xs text-ink-muted"
      />
      {num('sparkConcentration', 0, 1, 'percent', off || !s.sparks)}
      {num('sparkWeight', 0, 1, 'percent', off || !s.sparks)}
      <Heading>{t('photo.motionBlur')}</Heading>
      <Check
        checked={s.motionBlurred}
        onChange={(motionBlurred) => edit({ motionBlurred })}
        label={t('photo.enabled')}
        className="text-xs text-ink-muted"
      />
      {num('motionBlurAmount', 0, 20, 'plain', !s.motionBlurred)}
    </div>
  );
}
