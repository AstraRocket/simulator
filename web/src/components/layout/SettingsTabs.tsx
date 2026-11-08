import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../state/useSettings';
import {
  DEFAULT_SETTINGS,
  HEADER_SUMMARY_PREFS,
  PLAYBACK_SPEEDS,
  STATS_LAYOUTS,
  playbackLabel,
  type HeaderSummaryPref,
  type SimulationSettings,
  type StatsLayout,
} from '../../services/storage/settings';
import { PART_KEYS, mergePalette } from '../../services/design/partColors';
import type { FigureStyle } from '../../services/design/figureStyle';
import type { ComponentType } from '../../engine/openRocketEngine';
import { LineStyleRow } from '../design/LineStyleRow';
import { NumberRow } from '../common/NumberRow';
import { DefaultMaterials } from './DefaultMaterials';
import { LaunchPanel } from '../sim/LaunchPanel';
import { KERNEL_METHOD_ROWS, SIM_OPTION_FIELDS, simOptionUnit } from '../sim/simOptionFields';
import { StepperOptions } from '../sim/StepperOptions';
import { withRequiredFrom, type CompleteLaunch } from '../../services/flight/requiredLaunch';
import { launchPatchFor } from '../../services/design/orkTree';
import { IMPERIAL_UNITS, METRIC_UNITS, QUANTITIES, UNITS, unitScope } from '../../prefs/units';
import { useUnits } from '../../prefs/useUnits';
import { onSi } from '../../prefs/entryValue';
import { Check } from '../common/Check';
import { ColorField } from '../common/ColorInput';
import { canAskWhereToSave } from '../../services/files/saveFile';
import { SPEED_WARNINGS } from '../sim/speedWarnings';
import { EsriKeyField } from '../sim/EsriKeyField';
import { CardGroup } from '../common/CardGroup';
import { THEME_PREFS, type ThemePref } from '../../services/app/theme';
import { seedFromInput, stepperOf } from '../../services/flight/simulations';
import { withKey } from '../../services/app/objectKeys';
import { useLatestRef } from '../common/useLatestRef';
import { smallButton } from '../common/smallButton';

const RULER_SIDES = ['top', 'bottom', 'left', 'right'] as const;

export function GeneralTab() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  return (
    <>
      <p className="text-[11px] leading-snug text-ink-faint">{t('settings.generalNote')}</p>
      <label className="flex items-center justify-between gap-3 text-sm text-ink">
        <span>{t('settings.theme')}</span>
        <select
          value={settings.theme}
          onChange={(e) => update({ theme: e.target.value as ThemePref })}
          className="rounded-md bg-raised px-2 py-1 text-sm text-ink ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
        >
          {THEME_PREFS.map((p) => (
            <option key={p} value={p}>
              {t(`settings.themeOption.${p}`)}
            </option>
          ))}
        </select>
      </label>
      <p className="-mt-1 text-[11px] leading-snug text-ink-faint">{t('settings.themeHint')}</p>
      <label className="flex items-center justify-between gap-3 text-sm text-ink">
        <span>{t('settings.headerSummary')}</span>
        <select
          value={settings.headerSummary}
          onChange={(e) => update({ headerSummary: e.target.value as HeaderSummaryPref })}
          className="rounded-md bg-raised px-2 py-1 text-sm text-ink ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
        >
          {HEADER_SUMMARY_PREFS.map((p) => (
            <option key={p} value={p}>
              {t(`settings.headerSummaryOption.${p}`)}
            </option>
          ))}
        </select>
      </label>
      <p className="-mt-1 text-[11px] leading-snug text-ink-faint">{t('settings.headerSummaryHint')}</p>
      <label className="flex items-center justify-between gap-3 text-sm text-ink">
        <span>{t('settings.statsLayout')}</span>
        <select
          value={settings.statsLayout}
          onChange={(e) => update({ statsLayout: e.target.value as StatsLayout })}
          className="rounded-md bg-raised px-2 py-1 text-sm text-ink ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
        >
          {STATS_LAYOUTS.map((p) => (
            <option key={p} value={p}>
              {t(`settings.statsLayoutOption.${p}`)}
            </option>
          ))}
        </select>
      </label>
      <p className="-mt-1 text-[11px] leading-snug text-ink-faint">{t('settings.statsLayoutHint')}</p>
      <Check
        label={t('settings.saveDesignInfo')}
        checked={settings.saveDesignInfo}
        onChange={(v) => update({ saveDesignInfo: v })}
      />
      {canAskWhereToSave() && (
        <Check
          label={t('settings.askWhereToSave')}
          hint={t('settings.askWhereToSaveHint')}
          checked={settings.askWhereToSave}
          onChange={(v) => update({ askWhereToSave: v })}
        />
      )}
    </>
  );
}

export function UnitsTab() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const overriddenFields = Object.keys(settings.unitOverrides).length;
  return (
    <>
      <p className="text-[11px] leading-snug text-ink-faint">{t('settings.unitsNote')}</p>
      <div className="flex gap-2 pb-1">
        <button
          onClick={() => update({ units: METRIC_UNITS, unitOverrides: {} })}
          className="rounded-lg bg-raised px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-line/10 hover:bg-elevated"
        >
          {t('settings.unitsMetric')}
        </button>
        <button
          onClick={() => update({ units: IMPERIAL_UNITS, unitOverrides: {} })}
          className="rounded-lg bg-raised px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-line/10 hover:bg-elevated"
        >
          {t('settings.unitsImperial')}
        </button>
      </div>
      {QUANTITIES.map((q) => (
        <label key={q} className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink-soft">{t(`units.q.${q}`)}</span>
          <select
            aria-label={t(`units.q.${q}`)}
            value={settings.units[q]}
            onChange={(e) => update({ units: { ...settings.units, [q]: e.target.value } })}
            className="w-28 rounded-md bg-raised px-2 py-1 text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
          >
            {UNITS[q].map((u) => (
              <option key={u.symbol} value={u.symbol}>
                {u.symbol}
              </option>
            ))}
          </select>
        </label>
      ))}
      {overriddenFields > 0 && (
        <button
          onClick={() => update({ unitOverrides: {} })}
          className="mt-1 w-full rounded-lg bg-raised px-3 py-1.5 text-xs font-medium text-warn-300 ring-1 ring-line/10 hover:bg-elevated"
        >
          {t('settings.unitsClearFields', { count: overriddenFields })}
        </button>
      )}
    </>
  );
}

export function ColorsTab() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const palette = mergePalette(settings.partColors);
  const setPart = (key: string, color: string) => update({ partColors: { ...settings.partColors, [key]: color } });
  const resetPart = (key: string) =>
    update({ partColors: withKey(settings.partColors, key as keyof typeof settings.partColors, null) });
  const setPhase = (k: 'boost' | 'coast' | 'descent', c: string) =>
    update({ phaseColors: { ...settings.phaseColors, [k]: c } });
  return (
    <>
      {/* Not gated on width: a phone reaches the 3D model through the Sketch tab. */}
      <SubHeading first>{t('settings.parts')}</SubHeading>
      {PART_KEYS.map((key) => (
        <ColorRow
          key={key}
          label={t(`settings.part.${key}`)}
          value={palette[key]}
          overridden={key in settings.partColors}
          onChange={(c) => setPart(key, c)}
          onReset={() => resetPart(key)}
          resetTitle={t('settings.resetOneFor', { name: t(`settings.part.${key}`) })}
        />
      ))}
      <SubHeading>{t('settings.aeroHeat')}</SubHeading>
      <label className="flex items-center justify-between gap-3 text-sm text-ink-soft">
        {t('settings.aeroHeatLabel')}
        <select
          value={settings.aeroHeat}
          onChange={(e) => update({ aeroHeat: e.target.value as 'sky' | 'openrocket' })}
          className="w-44 rounded-md bg-raised px-2 py-1 text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
        >
          <option value="sky">{t('settings.aeroHeatSky')}</option>
          <option value="openrocket">{t('settings.aeroHeatOr')}</option>
        </select>
      </label>
      <p className="text-[11px] leading-snug text-ink-faint">{t('settings.aeroHeatNote')}</p>

      <FigureStyles />

      <SubHeading>{t('settings.phases')}</SubHeading>
      <ColorRow label={t('flight.boost')} value={settings.phaseColors.boost} onChange={(c) => setPhase('boost', c)} />
      <ColorRow label={t('flight.coast')} value={settings.phaseColors.coast} onChange={(c) => setPhase('coast', c)} />
      <ColorRow
        label={t('flight.descent')}
        value={settings.phaseColors.descent}
        onChange={(c) => setPhase('descent', c)}
      />
    </>
  );
}

function FigureStyles() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const types = Object.keys(settings.figureStyles) as ComponentType[];
  const set = (type: ComponentType, patch: Partial<FigureStyle>) =>
    update({ figureStyles: { ...settings.figureStyles, [type]: { ...settings.figureStyles[type], ...patch } } });
  const remove = (type: ComponentType) => update({ figureStyles: withKey(settings.figureStyles, type, null) });
  return (
    <>
      <SubHeading>{t('settings.figureStyles')}</SubHeading>
      {types.length === 0 ? (
        <p className="text-[11px] leading-snug text-ink-faint">{t('settings.figureStylesNone')}</p>
      ) : (
        types.map((type) => {
          const style = settings.figureStyles[type]!;
          const name = t(`part.${type}`, { defaultValue: type });
          return (
            <div key={type} className="space-y-1 rounded-md p-2 ring-1 ring-line/10">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink-soft">{name}</span>
                <button
                  type="button"
                  onClick={() => remove(type)}
                  title={t('settings.resetOneFor', { name })}
                  aria-label={t('settings.resetOneFor', { name })}
                  className={smallButton('xs', 'muted')}
                >
                  ↺
                </button>
              </div>
              {style.color && (
                <ColorRow
                  label={t('prop.componentColor')}
                  value={style.color}
                  onChange={(color) => set(type, { color })}
                />
              )}
              <LineStyleRow
                label={t('prop.componentLineStyle')}
                value={style.lineStyle}
                onCommit={(lineStyle) => set(type, { lineStyle })}
                labelClassName="text-sm text-ink-soft"
              />
            </div>
          );
        })
      )}
    </>
  );
}

export function MaterialsTab() {
  const { settings, update } = useSettings();
  return (
    <DefaultMaterials
      defaults={settings.defaultMaterials}
      onChange={(defaultMaterials) => update({ defaultMaterials })}
    />
  );
}

export function PlaybackTab() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink-soft">{t('settings.defaultSpeed')}</span>
      <select
        value={settings.playbackSpeed}
        onChange={(e) => update({ playbackSpeed: parseFloat(e.target.value) })}
        className="rounded-md bg-raised px-2 py-1 text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
      >
        {PLAYBACK_SPEEDS.map((s) => (
          <option key={s} value={s}>
            {playbackLabel(s)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SketchTab() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  return (
    <>
      <p className="text-[11px] leading-snug text-ink-faint">{t('settings.sketchNote')}</p>
      <Check
        label={t('settings.sketchMarkers')}
        checked={settings.showMarkers}
        onChange={(v) => update({ showMarkers: v })}
      />
      <SubHeading>{t('settings.sketchRulers')}</SubHeading>
      {RULER_SIDES.map((side) => (
        <Check
          key={side}
          label={t(`view.ruler_${side}`)}
          checked={settings.rulers[side]}
          onChange={(v) => update({ rulers: { ...settings.rulers, [side]: v } })}
        />
      ))}
    </>
  );
}

export function SimTab() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const u = useUnits();
  // Stored in radians, edited in the user's angle unit.
  const angle = u.at(unitScope('settings', 'maxAngleStep'), 'angle');
  const setSim = (patch: Partial<SimulationSettings>) => update({ simulation: { ...settings.simulation, ...patch } });
  return (
    <>
      <Check
        label={t('settings.confirmDelete')}
        checked={settings.simulation.confirmDelete}
        onChange={(v) => setSim({ confirmDelete: v })}
      />
      <Check
        label={t('settings.autoRunOutdated')}
        checked={settings.simulation.autoRunOutdated}
        onChange={(v) => setSim({ autoRunOutdated: v })}
      />
      <SubHeading>{t('settings.simOptions')}</SubHeading>
      {KERNEL_METHOD_ROWS.map((r) => (
        <InfoRow key={r.label} label={t(r.label)} value={t(r.value)} />
      ))}
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-soft">{t('settings.simMethod')}</span>
        <select
          value={settings.simulation.stepper}
          onChange={(e) => setSim({ stepper: stepperOf(e.target.value, DEFAULT_SETTINGS.simulation.stepper) })}
          className="rounded-md bg-raised px-2 py-1 text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
        >
          <StepperOptions />
        </select>
      </label>
      {SIM_OPTION_FIELDS.map((f) => {
        const fu = simOptionUnit(f, angle, t('units.second'));
        return (
          <NumRow
            key={f.key}
            label={t(f.label)}
            hint={'hint' in f ? t(f.hint) : undefined}
            unit={fu.sym}
            step={fu.step}
            min={fu.min}
            max={fu.max}
            value={fu.toUi(settings.simulation[f.key])}
            onChange={fu.entry((si) => setSim({ [f.key]: si ?? DEFAULT_SETTINGS.simulation[f.key] }))}
          />
        );
      })}
      <NumRow
        label={t('settings.randomSeed')}
        step={1}
        placeholder={t('settings.seedAuto')}
        value={settings.simulation.randomSeed}
        onChange={(v) => setSim({ randomSeed: seedFromInput(v) })}
      />
      <SubHeading>{t('settings.warnings')}</SubHeading>
      <NumRow
        label={t('settings.railExitMin')}
        hint={t('settings.railExitMinHint')}
        unit={u.sym('velocity')}
        step={u.step('velocity', 1)}
        min={0}
        value={u.toUi('velocity', settings.simulation.railExitVelocityMin)}
        onChange={onSi(u.plain('velocity'), (si) =>
          setSim({ railExitVelocityMin: si ?? DEFAULT_SETTINGS.simulation.railExitVelocityMin }),
        )}
      />
      {SPEED_WARNINGS.map((w) => (
        <NumRow
          key={w.key}
          label={t(w.label)}
          hint={t(w.hint)}
          unit={u.sym('velocity')}
          step={u.step('velocity', 1)}
          min={0}
          value={u.toUi('velocity', settings.simulation[w.key])}
          onChange={onSi(u.plain('velocity'), (si) => setSim({ [w.key]: si ?? DEFAULT_SETTINGS.simulation[w.key] }))}
        />
      ))}
      <SubHeading>{t('settings.simModel')}</SubHeading>
      <Check
        label={t('settings.guideAwareRodClearance')}
        hint={t('settings.guideAwareRodClearanceHint')}
        checked={settings.simulation.guideAwareRodClearance}
        onChange={(v) => setSim({ guideAwareRodClearance: v })}
      />
    </>
  );
}

export function LaunchTab() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  return (
    <>
      <p className="text-[11px] leading-snug text-ink-faint">
        {t('settings.launchNote')} {t('settings.launchStillAir')}
      </p>
      <div className="space-y-4">
        <LaunchDefaults launch={settings.launchDefaults} onSave={(launchDefaults) => update({ launchDefaults })} />
        <CardGroup title={t('map.cardTitle')}>
          <EsriKeyField />
        </CardGroup>
      </div>
    </>
  );
}

function LaunchDefaults({ launch, onSave }: { launch: CompleteLaunch; onSave: (l: CompleteLaunch) => void }) {
  const [draft, setDraft] = useState<CompleteLaunch | null>(null);
  const shown = draft ?? launch;
  const pending = useRef<CompleteLaunch | null>(null);
  const save = useLatestRef(onSave);
  const flush = () => {
    if (!pending.current) return;
    save.current(pending.current);
    pending.current = null;
    setDraft(null);
  };
  // Closing the dialog mid-edit unmounts the field without a blur.
  useEffect(
    () => () => {
      if (pending.current) save.current(pending.current);
    },
    [save],
  );
  return (
    <LaunchPanel
      weatherKey
      launch={shown}
      onChange={(patch) => {
        // From the pending draft: two patches can land before the next render.
        const from = pending.current ?? shown;
        const next = withRequiredFrom({ ...from, ...launchPatchFor(patch, from, 'defaults') }, from);
        pending.current = next;
        setDraft(next);
      }}
      onCommit={flush}
    />
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-sm text-ink-soft">{value}</span>
    </div>
  );
}

/** Written on blur: a per-keystroke write would refill an emptied box with its default. */
function NumRow(props: Omit<ComponentProps<typeof NumberRow>, 'commitOnBlur' | 'labelClassName'>) {
  return <NumberRow {...props} commitOnBlur labelClassName="text-sm text-ink-soft" />;
}

function SubHeading({ first, children }: { first?: boolean; children: React.ReactNode }) {
  return (
    <div className={`${first ? '' : 'pt-1 '}text-[11px] font-semibold uppercase tracking-wide text-ink-faint`}>
      {children}
    </div>
  );
}

function ColorRow({
  label,
  value,
  overridden,
  onChange,
  onReset,
  resetTitle,
}: {
  label: string;
  value: string;
  overridden?: boolean;
  onChange: (c: string) => void;
  onReset?: () => void;
  resetTitle?: string;
}) {
  return (
    <ColorField label={label} value={value} onCommit={onChange} labelClassName="text-sm text-ink-soft">
      {overridden && onReset && (
        <button onClick={onReset} title={resetTitle} aria-label={resetTitle} className={smallButton('xs', 'muted')}>
          ↺
        </button>
      )}
    </ColorField>
  );
}
