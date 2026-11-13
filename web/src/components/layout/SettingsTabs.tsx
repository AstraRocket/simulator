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
import { PART_KEYS } from '../../services/design/partColors';
import { usePartPalette } from '../common/usePartPalette';
import type { FigureStyle } from '../../services/design/figureStyle';
import type { ComponentType } from '../../engine/openRocketEngine';
import { LineStyleRow } from '../design/LineStyleRow';
import { NumberRow } from '../common/NumberRow';
import { DefaultMaterials } from './DefaultMaterials';
import { LaunchPanel } from '../sim/LaunchPanel';
import { SIM_OPTION_FIELDS, simOptionUnit } from '../sim/simOptionFields';
import { KernelMethodRows, StepperSelect } from '../sim/SimOptionRows';
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
import { SelectRow } from '../common/SelectRow';

const RULER_SIDES = ['top', 'bottom', 'left', 'right'] as const;

// m/s. Above 0, as the load keeps only a positive limit: a 0 would come back as the default.
const MIN_SPEED_LIMIT = 0.1;

export function GeneralTab() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  return (
    <>
      <p className="text-[11px] leading-snug text-ink-faint">{t('settings.generalNote')}</p>
      <SelectRow<ThemePref>
        label={t('settings.theme')}
        value={settings.theme}
        onChange={(theme) => update({ theme })}
        labelClassName="text-sm text-ink"
      >
        {THEME_PREFS.map((p) => (
          <option key={p} value={p}>
            {t(`settings.themeOption.${p}`)}
          </option>
        ))}
      </SelectRow>
      <p className="-mt-1 text-[11px] leading-snug text-ink-faint">{t('settings.themeHint')}</p>
      <SelectRow<HeaderSummaryPref>
        label={t('settings.headerSummary')}
        value={settings.headerSummary}
        onChange={(headerSummary) => update({ headerSummary })}
        labelClassName="text-sm text-ink"
      >
        {HEADER_SUMMARY_PREFS.map((p) => (
          <option key={p} value={p}>
            {t(`settings.headerSummaryOption.${p}`)}
          </option>
        ))}
      </SelectRow>
      <p className="-mt-1 text-[11px] leading-snug text-ink-faint">{t('settings.headerSummaryHint')}</p>
      <SelectRow<StatsLayout>
        label={t('settings.statsLayout')}
        value={settings.statsLayout}
        onChange={(statsLayout) => update({ statsLayout })}
        labelClassName="text-sm text-ink"
      >
        {STATS_LAYOUTS.map((p) => (
          <option key={p} value={p}>
            {t(`settings.statsLayoutOption.${p}`)}
          </option>
        ))}
      </SelectRow>
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
  const { settings, update, updateSection } = useSettings();
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
        <SelectRow
          key={q}
          label={t(`units.q.${q}`)}
          value={settings.units[q]}
          onChange={(v) => updateSection('units', { [q]: v })}
          width="w-28"
          labelClassName="text-sm text-ink-soft"
        >
          {UNITS[q].map((u) => (
            <option key={u.symbol} value={u.symbol}>
              {u.symbol}
            </option>
          ))}
        </SelectRow>
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
  const { settings, update, updateSection } = useSettings();
  const palette = usePartPalette();
  const setPart = (key: string, color: string) => updateSection('partColors', { [key]: color });
  const resetPart = (key: string) =>
    update({ partColors: withKey(settings.partColors, key as keyof typeof settings.partColors, null) });
  const setPhase = (k: 'boost' | 'coast' | 'descent', c: string) => updateSection('phaseColors', { [k]: c });
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
      <SelectRow<'sky' | 'openrocket'>
        label={t('settings.aeroHeatLabel')}
        value={settings.aeroHeat}
        onChange={(aeroHeat) => update({ aeroHeat })}
        width="w-44"
        labelClassName="text-sm text-ink-soft"
      >
        <option value="sky">{t('settings.aeroHeatSky')}</option>
        <option value="openrocket">{t('settings.aeroHeatOr')}</option>
      </SelectRow>
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
  const { settings, update, updateSection } = useSettings();
  const types = Object.keys(settings.figureStyles) as ComponentType[];
  const set = (type: ComponentType, patch: Partial<FigureStyle>) =>
    updateSection('figureStyles', { [type]: { ...settings.figureStyles[type], ...patch } });
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
    <SelectRow
      label={t('settings.defaultSpeed')}
      value={settings.playbackSpeed}
      onChange={(v) => update({ playbackSpeed: parseFloat(v) })}
      labelClassName="text-sm text-ink-soft"
    >
      {PLAYBACK_SPEEDS.map((s) => (
        <option key={s} value={s}>
          {playbackLabel(s)}
        </option>
      ))}
    </SelectRow>
  );
}

export function SketchTab() {
  const { t } = useTranslation();
  const { settings, update, updateSection } = useSettings();
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
          onChange={(v) => updateSection('rulers', { [side]: v })}
        />
      ))}
    </>
  );
}

export function SimTab() {
  const { t } = useTranslation();
  const { settings, updateSection } = useSettings();
  const u = useUnits();
  // Stored in radians, edited in the user's angle unit.
  const angle = u.at(unitScope('settings', 'maxAngleStep'), 'angle');
  const setSim = (patch: Partial<SimulationSettings>) => updateSection('simulation', patch);
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
      <KernelMethodRows />
      <StepperSelect
        value={settings.simulation.stepper}
        onChange={(v) => setSim({ stepper: stepperOf(v, DEFAULT_SETTINGS.simulation.stepper) })}
        labelClassName="text-sm text-ink-soft"
      />
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
        min={u.toUi('velocity', MIN_SPEED_LIMIT)}
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
          min={u.toUi('velocity', MIN_SPEED_LIMIT)}
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
