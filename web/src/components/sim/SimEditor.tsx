import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore, selectActive, selectConfig } from '../../state/store';
import { launchDiffKeys, prefDiffKeys } from '../../services/flight/simDiff';
import { configFor, configLabel, loadoutLabel } from '../../services/flight/flightConfigs';
import { configPowerClass } from '../../services/flight/powerClass';
import { useSettings } from '../../state/SettingsProvider';
import { RunButton } from './RunButton';
import { useIsDesktop } from '../common/useMediaQuery';
import { LaunchPanel } from './LaunchPanel';
import { useLauncherKind } from '../common/useLauncher';
import { useUnits } from '../../prefs/useUnits';
import { onSi } from '../../prefs/entryValue';
import { unitScope } from '../../prefs/units';
import type { SimPrefs, Simulation } from '../../services/flight/simulations';
import { SIM_STEPPERS, clampMaxAngleStep, seedFromInput, stepperOf } from '../../services/flight/simulations';
import { FieldLabel, markRing } from '../common/FieldMark';
import { NumberRow } from '../common/NumberRow';
import { fmtUpTo } from '../../i18n/format';
import { SPEED_WARNINGS } from './speedWarnings';
import { KERNEL_METHOD_ROWS, SIM_OPTION_FIELDS, STEPPER_LABELS, simOptionUnit } from './simOptionFields';
import { CardGroup } from '../common/CardGroup';
import { smallButton } from '../common/smallButton';

export function SimEditor() {
  const { t } = useTranslation();
  const activeId = useWorkspaceStore((s) => selectActive(s).id);
  const name = useWorkspaceStore((s) => selectActive(s).name);
  const launch = useWorkspaceStore((s) => selectActive(s).launch);
  const tree = useWorkspaceStore((s) => s.tree);
  const config = useWorkspaceStore(selectConfig);
  const configs = useWorkspaceStore((s) => s.configs);
  const onRenameSim = useWorkspaceStore((s) => s.renameSim);
  const setSimConfig = useWorkspaceStore((s) => s.setSimConfig);
  const setSelectedConfigId = useWorkspaceStore((s) => s.setSelectedConfigId);
  const setTab = useWorkspaceStore((s) => s.setTab);
  const onLaunchChange = useWorkspaceStore((s) => s.patchLaunch);
  const launcher = useLauncherKind();
  const onCommit = useWorkspaceStore((s) => s.commitEdit);

  const desktop = useIsDesktop();

  // Derived rather than subscribed: the id list is rebuilt per call and zustand compares by reference.
  const sims = useWorkspaceStore((s) => s.sims);
  const selectedIds = useWorkspaceStore((s) => s.selectedSimIds);
  const targets = useMemo(() => {
    const ids = new Set(selectedIds.length ? selectedIds : [activeId]);
    return sims.filter((x) => ids.has(x.id));
  }, [sims, selectedIds, activeId]);
  const multi = targets.length > 1;

  const launchDiff = useMemo(() => launchDiffKeys(targets), [targets]);
  const prefDiff = useMemo(() => prefDiffKeys(targets), [targets]);

  const dryMass = useWorkspaceStore((s) => s.info?.massEmpty);
  const powerClass = useMemo(() => {
    const classes = new Set(targets.map((x) => configPowerClass(tree, configFor(configs, x.configId), dryMass)));
    return classes.size === 1 ? [...classes][0]! : null;
  }, [targets, tree, configs, dryMass]);

  // Always mounted: a live region created with its text is not announced.
  const banner = (
    <p
      role="status"
      className={
        multi
          ? 'rounded-lg border border-accent-500/30 bg-accent-950/40 px-2 py-1.5 text-xs leading-snug text-accent-200'
          : 'sr-only'
      }
    >
      {multi && (
        <>
          {t('sims.editingMany', { count: targets.length })}{' '}
          <span className="text-accent-300">{t('sims.editingManyHint')}</span>
        </>
      )}
    </p>
  );

  return (
    <div className="relative p-3">
      {/* Full-bleed: -mx-3 -mt-3 cancel the parent's p-3. */}
      {desktop && (
        <div className="sticky top-0 z-10 -mx-3 -mt-3 mb-4 space-y-2 border-b border-line/10 bg-canvas p-3">
          <RunButton />
          {banner}
        </div>
      )}

      <div className="space-y-4">
        {!desktop && banner}

        <section className="rounded-xl bg-surface p-3 ring-1 ring-line/10">
          {/* Does not follow the selection: rows would end up with the same name. */}
          <div className="mb-1 flex items-baseline gap-2 text-[10px] uppercase tracking-wide text-ink-muted">
            {t('sims.name')}
            {multi && <span className="normal-case text-ink-faint">{t('sims.thisOneOnly')}</span>}
          </div>
          <input
            value={name}
            onChange={(e) => onRenameSim(activeId, e.target.value)}
            onBlur={onCommit}
            aria-label={t('sims.rename')}
            className="w-full rounded-md bg-raised px-2 py-1.5 text-sm font-medium text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
          />
        </section>

        <section className="rounded-xl bg-surface p-3 ring-1 ring-line/10">
          <div className="mb-1 flex items-baseline gap-2 text-[10px] uppercase tracking-wide text-ink-muted">
            {t('configs.name')}
            {multi && <span className="normal-case text-ink-faint">{t('sims.thisOneOnly')}</span>}
          </div>
          <select
            value={config.id}
            onChange={(e) => setSimConfig(activeId, e.target.value)}
            aria-label={t('configs.pick')}
            className="w-full rounded-md bg-raised px-2 py-1.5 text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
          >
            {configs.map((c) => (
              <option key={c.id} value={c.id}>
                {configLabel(tree, c) || t('configs.noMotors')}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-ink-muted">{loadoutLabel(tree, config) || t('configs.noMotors')}</p>
          <button
            type="button"
            onClick={() => {
              setSelectedConfigId(config.id);
              setTab('configs');
            }}
            className="mt-2 rounded-md bg-raised px-3 py-1.5 text-xs font-medium text-ink hover:bg-elevated"
          >
            {t('configs.edit')}
          </button>
        </section>

        <LaunchPanel
          launch={launch}
          onChange={onLaunchChange}
          onCommit={onCommit}
          diff={launchDiff}
          weather
          launcher={launcher}
          powerClass={powerClass}
        />
        <SimOptions diff={prefDiff} targets={targets} />
      </div>
    </div>
  );
}

/** Slider stops in s, coarsest to finest. */
const TIME_STEPS = [0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.001];

const nearestStepIndex = (v: number): number =>
  TIME_STEPS.reduce((best, s, i) => (Math.abs(s - v) < Math.abs(TIME_STEPS[best]! - v) ? i : best), 0);

/** Unlike OpenRocket, overrides fall through to the global rather than being copied at creation. */
function SimOptions({ diff, targets }: { diff?: ReadonlySet<keyof SimPrefs>; targets: readonly Simulation[] }) {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const u = useUnits();
  const prefs = useWorkspaceStore((s) => selectActive(s).prefs);
  const setSimPref = useWorkspaceStore((s) => s.setSimPref);
  const clearSimPrefs = useWorkspaceStore((s) => s.clearSimPrefs);
  const onCommit = useWorkspaceStore((s) => s.commitEdit);
  const mixedHintId = useId();
  const g = settings.simulation;
  const angle = u.at(unitScope('settings', 'maxAngleStep'), 'angle');

  const eff = { ...g, ...(prefs ?? {}) };
  const mixed = (k: keyof SimPrefs) => diff?.has(k) ?? false;
  const overridden = targets.some((x) => Object.keys(x.prefs ?? {}).length > 0);
  const mixedOptions = (diff?.size ?? 0) > 0;

  // Deployment thresholds are stored in SI and shown in the velocity unit.
  const speed = (si: number | undefined): number | null => (si == null ? null : u.toUi('velocity', si));
  const onSpeed = (key: (typeof SPEED_WARNINGS)[number]['key']) =>
    onSi(u.plain('velocity'), (si) => setSimPref(key, si));
  const vSym = u.sym('velocity');
  const vStep = u.step('velocity', 1);

  return (
    <CardGroup title={t('sims.options')}>
      <dl className="mb-3 space-y-1">
        {KERNEL_METHOD_ROWS.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-ink-muted">{t(r.label)}</dt>
            <dd className="text-xs text-ink-soft">{t(r.value)}</dd>
          </div>
        ))}
      </dl>

      <label className="mb-2 flex items-center justify-between gap-3">
        <FieldLabel text={t('settings.simMethod')} mixed={mixed('stepper')} />
        <select
          value={prefs?.stepper ?? ''}
          onChange={(e) => {
            setSimPref('stepper', e.target.value ? stepperOf(e.target.value, g.stepper) : null);
            onCommit();
          }}
          className={markRing(
            'rounded-md bg-raised px-2 py-1 text-xs text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500',
            false,
            mixed('stepper'),
          )}
        >
          <option value="">{t('sims.stepperDefault', { method: t(STEPPER_LABELS[g.stepper]) })}</option>
          {SIM_STEPPERS.map((s) => (
            <option key={s} value={s}>
              {t(STEPPER_LABELS[s])}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        {SIM_OPTION_FIELDS.map((f) => {
          const fu = simOptionUnit(f, angle, t('units.second'));
          const own = prefs?.[f.key];
          return (
            <NumberRow
              key={f.key}
              label={t(f.label)}
              hint={'hint' in f ? t(f.hint) : undefined}
              unit={fu.sym}
              mixed={mixed(f.key)}
              value={own == null ? null : fu.toUi(f.key === 'maxAngleStep' ? clampMaxAngleStep(own) : own)}
              placeholder={fmtUpTo(fu.toUi(g[f.key]), f.placeholderDigits)}
              step={fu.step}
              min={fu.min}
              max={fu.max}
              onChange={fu.entry((si) => setSimPref(f.key, si))}
              onCommit={onCommit}
            />
          );
        })}
        <input
          type="range"
          min={0}
          max={TIME_STEPS.length - 1}
          step={1}
          aria-label={t('settings.timeStepScale')}
          value={nearestStepIndex(eff.timeStep)}
          aria-valuetext={`${fmtUpTo(TIME_STEPS[nearestStepIndex(eff.timeStep)]!, 4)} ${t('units.second')}`}
          onChange={(e) => setSimPref('timeStep', TIME_STEPS[Number(e.target.value)]!)}
          // Pointer, not mouse: a touch drag sends no mouseup, leaving the undo entry open.
          onPointerUp={onCommit}
          onKeyUp={onCommit}
          className="w-full accent-accent-500"
        />
        <NumberRow
          label={t('settings.randomSeed')}
          mixed={mixed('randomSeed')}
          value={prefs?.randomSeed ?? null}
          placeholder={g.randomSeed == null ? t('settings.seedAuto') : String(g.randomSeed)}
          step={1}
          onChange={(v) => setSimPref('randomSeed', seedFromInput(v))}
          onCommit={onCommit}
        />
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!overridden}
          onClick={() => {
            clearSimPrefs();
            onCommit();
          }}
          className={smallButton('row', 'soft', 'flex-1')}
        >
          {t('sims.resetToDefault')}
        </button>
        <button
          type="button"
          disabled={mixedOptions}
          aria-describedby={mixedOptions ? mixedHintId : undefined}
          onClick={() => {
            // Dropped as overrides, or this sim would stop following later global changes.
            update({ simulation: eff });
            clearSimPrefs();
            onCommit();
          }}
          className={smallButton('row', 'soft', 'flex-1')}
        >
          {t('sims.saveAsDefault')}
        </button>
      </div>
      {mixedOptions && (
        <p id={mixedHintId} className="mt-1 text-[11px] text-ink-faint">
          {t('sims.saveAsDefaultMixed')}
        </p>
      )}

      <div className="mt-3 border-t border-line/10 pt-2 text-[10px] uppercase tracking-wide text-ink-muted">
        {t('settings.warnings')}
      </div>
      <div className="mt-2 space-y-2">
        {SPEED_WARNINGS.map((w) => (
          <NumberRow
            key={w.key}
            label={t(w.label)}
            hint={t(w.hint)}
            unit={vSym}
            mixed={mixed(w.key)}
            value={speed(prefs?.[w.key])}
            placeholder={u.fmt('velocity', g[w.key])}
            step={vStep}
            min={0}
            onChange={onSpeed(w.key)}
            onCommit={onCommit}
          />
        ))}
      </div>

      <p className="mt-2 text-[11px] text-ink-faint">{t('sims.optionsHint')}</p>
    </CardGroup>
  );
}
