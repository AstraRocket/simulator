import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberInput } from '../common/NumberInput';
import { type MotorSpec, type IgnitionEvent } from '../../engine/openRocketEngine';
import { MotorDialog } from './MotorDialog';
import type { LiftoffAt } from './useLiftoffFields';
import type { MountFit } from '../../services/motors/motorPicker';
import { MotorSpecDialog } from './MotorSpecDialog';
import { useUnits } from '../../prefs/useUnits';
import { motorName } from '../../services/motors/motorName';
import { IGNITION_EVENTS } from '../../services/design/componentFields';
import type { IgnitionScope } from '../../state/store';
import { ejectionDelayText } from './motorFormat';
import { RadioGroup } from '../common/RadioGroup';

export function MotorRow({
  motor,
  onChange,
  onError,
  mount,
  title,
  ignition,
  onIgnitionChange,
  ignitionEverywhere,
  onCommit,
  soloEdit,
  used,
  liftoff,
}: {
  motor: MotorSpec | null;
  onChange: (m: MotorSpec) => void;
  onError: (msg: string | null) => void;
  /** Bore and room in mm. */
  mount?: MountFit | null;
  title?: string;
  ignition?: { event: IgnitionEvent; delay: number };
  onIgnitionChange?: (event: IgnitionEvent, delay: number, scope: IgnitionScope) => void;
  ignitionEverywhere?: boolean;
  onCommit?: () => void;
  soloEdit?: boolean;
  used?: MotorSpec[];
  liftoff?: LiftoffAt;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const [open, setOpen] = useState(false);
  const [curveOpen, setCurveOpen] = useState(false);
  const hasCurve = !!motor?.masses?.length;
  const cardLabel = title ?? t('sims.motor');
  return (
    <section aria-label={cardLabel} className={'rounded-xl bg-surface p-3 ring-1 ring-line/10'}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 text-[10px] uppercase tracking-wide text-ink-muted">
            {cardLabel}
            {soloEdit && <span className="normal-case text-ink-faint">{t('sims.thisOneOnly')}</span>}
          </div>
          {motor ? (
            <>
              <div className="truncate font-data text-lg font-semibold text-accent-400">{motorName(motor)}</div>
              <div className="text-xs text-ink-faint">
                {u.fmt('motorDimensions', motor.diameter)} × {u.fmt('motorDimensions', motor.length)}{' '}
                {u.sym('motorDimensions')}
                {hasCurve ? ` · ${u.fmtSym('mass', motor.masses[0]!)}` : ''}
              </div>
              {hasCurve ? (
                <div className="mt-0.5 text-xs text-ink-faint">
                  {t('sims.delay')} {ejectionDelayText(motor.ejectionDelay, t)}
                  {motor.curveSrc ? <span className="text-ink-muted"> · {motor.curveSrc}</span> : null}
                </div>
              ) : (
                <div className="mt-0.5 text-xs text-warn-400">{t('sims.motorNotFound')}</div>
              )}
            </>
          ) : (
            <div className="mt-0.5 text-sm text-ink-faint">{t('sims.noMotor')}</div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasCurve && (
            <button
              onClick={() => setCurveOpen(true)}
              title={t('sims.viewCurve')}
              aria-label={t('sims.viewCurve')}
              className="rounded-lg bg-raised px-2 py-1.5 text-xs text-ink hover:bg-elevated"
            >
              📈
            </button>
          )}
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg bg-raised px-3 py-1.5 text-xs font-medium text-ink hover:bg-elevated"
          >
            {t('sims.changeMotor')}
          </button>
        </div>
      </div>
      {motor && ignition && onIgnitionChange && (
        <IgnitionControl
          event={ignition.event}
          delay={ignition.delay}
          onChange={onIgnitionChange}
          everywhere={ignitionEverywhere ?? false}
          onCommit={onCommit}
        />
      )}
      {open && (
        <MotorDialog
          onClose={() => setOpen(false)}
          onSelect={onChange}
          onError={onError}
          mount={mount}
          current={motor}
          used={used}
          liftoff={liftoff}
        />
      )}
      {curveOpen && hasCurve && motor && <MotorSpecDialog motor={motor} onClose={() => setCurveOpen(false)} />}
    </section>
  );
}

/** Mirrors desktop IgnitionSelectionDialog; reset is `MotorConfiguration.useDefaultIgnition`, not the mount's own. */
function IgnitionControl({
  event,
  delay,
  onChange,
  everywhere,
  onCommit,
}: {
  event: IgnitionEvent;
  delay: number;
  onChange: (event: IgnitionEvent, delay: number, scope: IgnitionScope) => void;
  everywhere: boolean;
  onCommit?: () => void;
}) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<IgnitionScope>('config');
  const isReset = event === 'automatic' && delay === 0;
  return (
    <div className="mt-2 space-y-2 border-t border-line/5 pt-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-faint">{t('sims.ignition')}</span>
        <select
          value={event}
          aria-label={t('sims.ignition')}
          onChange={(e) => {
            onChange(e.target.value as IgnitionEvent, delay, scope);
            onCommit?.();
          }}
          className="min-w-0 flex-1 rounded-md bg-canvas px-2 py-1 text-xs text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
        >
          {IGNITION_EVENTS.map((ev) => (
            <option key={ev} value={ev}>
              {t(`ignition.${ev}`)}
            </option>
          ))}
        </select>
        {event !== 'never' && (
          <label className="flex shrink-0 items-center gap-1 text-ink-faint">
            +{/* `NumberInput`: a raw box would commit a zero delay when cleared to retype. */}
            <NumberInput
              min={0}
              step={0.5}
              value={delay}
              ariaLabel={t('sims.ignitionDelay')}
              onChange={(v) => {
                if (v !== null) onChange(event, v, scope);
              }}
              onCommit={onCommit}
              className="w-14 rounded bg-canvas px-1.5 py-0.5 text-right tabular-nums text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
            />
            {t('units.second')}
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RadioGroup
          layout="inline"
          legend={t('sims.ignitionScope')}
          options={['config', 'all'] as const}
          value={scope}
          onChange={setScope}
          fmt={(s) => t(s === 'all' ? 'sims.ignitionAll' : 'sims.ignitionThis')}
        />
        <button
          type="button"
          disabled={isReset}
          title={t('sims.resetIgnitionHint')}
          onClick={() => {
            onChange('automatic', 0, 'config');
            onCommit?.();
          }}
          className="rounded-md bg-raised px-2 py-1 text-xs text-ink hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-raised"
        >
          {t('sims.resetIgnition')}
        </button>
      </div>
      {scope === 'all' && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-ink-faint">{t('sims.ignitionAllHint')}</p>
          {/* Desktop's OK applies the values whether or not they were edited. */}
          <button
            type="button"
            disabled={everywhere}
            onClick={() => {
              onChange(event, delay, 'all');
              onCommit?.();
            }}
            className="rounded-md bg-raised px-2 py-1 text-xs text-ink hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-raised"
          >
            {t('sims.ignitionApplyAll')}
          </button>
        </div>
      )}
    </div>
  );
}
