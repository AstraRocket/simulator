import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { fmtNum, partLabel } from '../../i18n/format';
import { stageNodes } from '../../tree/treeWalk';
import { NO_VALUE } from '../../i18n/noValue';
import { useWorkspaceStore } from '../../state/store';
import { confirm } from '../../state/confirmStore';
import { uuid } from '../../services/app/uuid';
import { DEFAULT_BAY_PRESSURE_PA } from '../../services/flight/ejectionCharge';
import { PIN_SIZES, PIN_STRENGTH_N, type PinSize, type ShearPins } from '../../services/flight/ejectionBay';
import { BACKUP_FACTOR, suggestedBackup, suggestedCharge } from '../../services/flight/recoveryCharges';
import {
  bayCharges,
  designBays,
  effectiveBay,
  TEST_RESULTS,
  updateBay,
  type BayPins,
  type BayRecord,
  type DesignBay,
  type GroundTest,
  type PinSource,
  type TestResult,
} from '../../services/flight/recoveryBays';
import { QNum } from '../sim/QNum';
import { NumberRow } from '../common/NumberRow';
import { FieldLabel } from '../common/FieldMark';
import { CardGroup } from '../common/CardGroup';
import { smallButton } from '../common/smallButton';
import { useScopedUnit } from '../common/UnitChip';
import { EjectionFigures } from '../tools/EjectionFigures';

function pinsText(
  pins: ShearPins,
  source: PinSource,
  t: (key: string, vars?: Record<string, unknown>) => string,
  force: (n: number) => string,
): string {
  if (source === 'bay') {
    if (pins.count === 0) return t('bays.pinsBayNone');
    const pin = pins.size ? `#${pins.size}` : force(pins.forceN);
    return t('bays.pinsBay', { n: pins.count, pin, each: force(pins.forceN) });
  }
  if (!pins.from) return t('ejectionBay.pinsDefault');
  if (pins.count === 0) return t('ejectionBay.pinsNone', { name: pins.from });
  const pin = pins.size ? `#${pins.size}` : force(pins.forceN);
  return t('ejectionBay.pinsFrom', { n: pins.count, pin, each: force(pins.forceN), name: pins.from });
}

export function RecoveryBaysPane() {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const bays = useMemo(() => designBays(tree), [tree]);
  if (!bays.length) return <p className="p-3 text-xs text-ink-muted">{t('bays.none')}</p>;
  // Grouped by stage even for one stage: two stages can each have a "Body tube".
  return (
    <div className="space-y-4 p-3">
      <p className="text-[11px] leading-snug text-ink-faint">{t('bays.hint')}</p>
      {stageNodes(tree).map((s) => {
        const own = bays.filter((b) => b.stageId === s.id);
        if (!own.length) return null;
        return <StageBays key={s.id} title={partLabel(t, s)} bays={own} />;
      })}
    </div>
  );
}

function StageBays({ title, bays }: { title: string; bays: DesignBay[] }) {
  const [open, setOpen] = useState(true);
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h3 id={id}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center gap-1.5 border-b border-line/10 pb-1 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted hover:text-ink"
        >
          <span aria-hidden className={`transition-transform ${open ? 'rotate-90' : ''}`}>
            ›
          </span>
          {title}
        </button>
      </h3>
      {open && bays.map((b) => <BayCard key={`${b.tubeId}:${b.role}`} bay={b} />)}
    </section>
  );
}

const SELECT =
  'rounded-md bg-raised px-2 py-1 text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500';

const RESULT_TONE: Record<TestResult, string> = {
  clean: 'text-ok-400',
  violent: 'text-warn-400',
  partial: 'text-warn-400',
  none: 'text-danger-400',
  pinsHeld: 'text-danger-400',
};

function BayCard({ bay }: { bay: DesignBay }) {
  const { t } = useTranslation();
  const u = useUnits();
  const tree = useWorkspaceStore((s) => s.tree);
  const applyTreeAction = useWorkspaceStore((s) => s.applyTreeAction);
  const update = (patch: Partial<BayRecord>) => applyTreeAction((tr) => updateBay(tr, bay.tubeId, bay.role, patch));
  const { record, drawn } = bay;
  const settings = effectiveBay(bay);
  const pins = settings.pins;
  const charges = bayCharges(tree, bay);
  const suggestion = suggestedCharge(settings.boreM, settings.lengthM, settings.pressurePa, pins);
  const force = (n: number) => u.fmtSym('force', n);
  const lengthUnit = u.at(unitScope('launch', 'bayLength'), 'length');
  const pressureUnit = u.at(unitScope('launch', 'bayPressure'), 'pressure');
  const flownFrom = record.flownTestId ? record.tests.find((x) => x.id === record.flownTestId) : undefined;

  /** Starts from the pins in effect, not the record's. */
  const setPins = (change: Partial<BayPins>) => {
    const base: BayPins = { count: pins.count, size: pins.size, forceN: pins.forceN };
    update({ pins: { ...base, ...change } });
  };
  const title = t('bays.title', {
    role: t(`charges.role_${bay.role}`),
    tube: bay.tubeName || t('ejectionBay.unnamedTube'),
  });

  return (
    <CardGroup title={title} region>
      {bay.devices.length > 0 && (
        <p className="text-[11px] text-ink-faint">{t('bays.devices', { devices: bay.devices.join(', ') })}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-ink-muted">{t('bays.settings')}</h3>
          <QNum
            label={t('ejectionTool.bore')}
            field="bayBore"
            kind="length"
            u={u}
            stepSi={0.001}
            minSi={0.005}
            maxSi={1}
            placeholder={lengthUnit.fmt(drawn.boreM)}
            commitOnBlur
            value={record.boreM ?? null}
            onChange={(v) => update({ boreM: v ?? undefined })}
          />
          <QNum
            label={t('ejectionTool.length')}
            hint={t(drawn.wholeTube ? 'ejectionBay.wholeTube' : 'bays.lengthHint')}
            field="bayLength"
            kind="length"
            u={u}
            stepSi={0.001}
            minSi={0.005}
            maxSi={5}
            placeholder={lengthUnit.fmt(drawn.lengthM)}
            commitOnBlur
            value={record.lengthM ?? null}
            onChange={(v) => update({ lengthM: v ?? undefined })}
          />
          <QNum
            label={t('ejectionTool.pressure')}
            field="bayPressure"
            kind="pressure"
            u={u}
            stepSi={1000}
            minSi={1000}
            maxSi={1e6}
            placeholder={pressureUnit.fmt(DEFAULT_BAY_PRESSURE_PA)}
            commitOnBlur
            value={record.pressurePa ?? null}
            onChange={(v) => update({ pressurePa: v ?? undefined })}
          />
          <NumberRow
            label={t('ejectionTool.pinCount')}
            step={1}
            min={0}
            max={24}
            commitOnBlur
            value={pins.count}
            onChange={(v) => setPins({ count: v == null ? 0 : Math.round(v) })}
          />
          <label className="flex items-center justify-between gap-3">
            <FieldLabel text={t('bays.pinSize')} />
            <select
              value={pins.size ?? 'measured'}
              onChange={(e) => {
                const size = e.target.value as PinSize | 'measured';
                setPins(size === 'measured' ? { size: null } : { size, forceN: PIN_STRENGTH_N[size] });
              }}
              className={`w-32 ${SELECT}`}
            >
              {PIN_SIZES.map((z) => (
                <option key={z} value={z}>{`#${z}`}</option>
              ))}
              <option value="measured">{t('bays.pinMeasured')}</option>
            </select>
          </label>
          <QNum
            label={t('ejectionTool.pinForce')}
            field="bayPinForce"
            kind="force"
            u={u}
            stepSi={1}
            minSi={1}
            maxSi={10000}
            commitOnBlur
            value={pins.forceN}
            onChange={(v) => v != null && setPins({ forceN: v, size: null })}
          />
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] text-ink-faint">{pinsText(pins, settings.pinSource, t, force)}</p>
            {record.pins && (
              <button type="button" onClick={() => update({ pins: undefined })} className={smallButton('sm', 'soft')}>
                {t('bays.resetPins')}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-ink-muted">{t('bays.estimate')}</h3>
          <EjectionFigures
            boreM={settings.boreM}
            lengthM={settings.lengthM}
            pressurePa={settings.pressurePa}
            pinCount={pins.count > 0 ? pins.count : null}
            pinForceN={pins.count > 0 ? pins.forceN : null}
          />
          <h3 className="pt-2 text-xs font-semibold text-ink-muted">{t(`ejectionBay.saved_${bay.role}`)}</h3>
          <QNum
            label={t('ejectionBay.primary')}
            field="chargePrimary"
            kind="mass"
            u={u}
            stepSi={0.0001}
            minSi={0.0001}
            maxSi={0.1}
            commitOnBlur
            value={charges.primaryKg}
            onChange={(v) => update({ primaryKg: v ?? undefined, flownTestId: undefined })}
          />
          <QNum
            label={t('ejectionBay.backup')}
            hint={t('ejectionBay.backupHint', { factor: fmtNum(BACKUP_FACTOR, 1) })}
            field="chargeBackup"
            kind="mass"
            u={u}
            stepSi={0.0001}
            minSi={0.0001}
            maxSi={0.1}
            commitOnBlur
            value={charges.backupKg}
            onChange={(v) => update({ backupKg: v ?? undefined })}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-ink-faint">
              {flownFrom ? t('bays.fromTest', { date: flownFrom.date }) : t('bays.chargesMirrored')}
            </p>
            <button
              type="button"
              disabled={suggestion == null}
              onClick={() =>
                suggestion != null &&
                update({ primaryKg: suggestion, backupKg: suggestedBackup(suggestion), flownTestId: undefined })
              }
              className={smallButton('sm', 'soft', 'shrink-0')}
            >
              {t('ejectionBay.useSuggestion')}
            </button>
          </div>
        </div>
      </div>

      <TestLog bay={bay} suggestion={charges.primaryKg ?? suggestion} pins={pins} update={update} />
    </CardGroup>
  );
}

/** Local time, not `toISOString` (UTC). */
function today(): string {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

function TestLog({
  bay,
  suggestion,
  pins,
  update,
}: {
  bay: DesignBay;
  suggestion: number | null;
  pins: BayPins;
  update: (patch: Partial<BayRecord>) => void;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const mass = useScopedUnit(unitScope('launch', 'testCharge'), 'mass');
  const [date, setDate] = useState(today);
  const [chargeKg, setChargeKg] = useState<number | null>(suggestion);
  const [result, setResult] = useState<TestResult>('clean');
  const [notes, setNotes] = useState('');
  const { tests, flownTestId } = bay.record;
  const newestFirst = [...tests].sort((a, b) => b.date.localeCompare(a.date));

  const log = () => {
    if (chargeKg == null || !date) return;
    const test: GroundTest = {
      id: uuid(),
      date,
      chargeKg,
      pins: pins.count > 0 ? { count: pins.count, size: pins.size, forceN: pins.forceN } : null,
      result,
      notes: notes.trim(),
    };
    update({ tests: [...tests, test] });
    setNotes('');
  };
  const remove = async (id: string) => {
    if (!(await confirm({ message: t('bays.deleteTestConfirm'), danger: true }))) return;
    update({ tests: tests.filter((x) => x.id !== id), ...(flownTestId === id ? { flownTestId: undefined } : {}) });
  };
  const pinLabel = (p: BayPins | null) =>
    !p || p.count === 0 ? t('bays.noPins') : `${p.count} × ${p.size ? `#${p.size}` : u.fmtSym('force', p.forceN)}`;

  return (
    <div className="space-y-2 border-t border-line/5 pt-3">
      <h3 className="text-xs font-semibold text-ink-muted">{t('bays.tests')}</h3>
      {newestFirst.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[11px] text-ink-muted">
                <th scope="col" className="py-1 pr-2 font-medium">
                  {t('bays.date')}
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">
                  {t('bays.charge')} {mass.chip(t('bays.charge'))}
                </th>
                <th scope="col" className="py-1 pr-2 font-medium">
                  {t('ejectionTool.pins')}
                </th>
                <th scope="col" className="py-1 pr-2 font-medium">
                  {t('bays.result')}
                </th>
                <th scope="col" className="py-1 pr-2 font-medium">
                  {t('bays.notes')}
                </th>
                <th scope="col" className="py-1">
                  <span className="sr-only">{t('bays.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {newestFirst.map((x) => (
                <tr key={x.id} className="border-t border-line/5 align-top">
                  <td className="py-1 pr-2 tabular-nums text-ink">{x.date}</td>
                  <td className="py-1 pr-2 text-right tabular-nums text-ink">{mass.fmt(x.chargeKg, 2)}</td>
                  <td className="py-1 pr-2 text-ink-soft">{pinLabel(x.pins)}</td>
                  <td className={`py-1 pr-2 font-medium ${RESULT_TONE[x.result]}`}>{t(`bays.result_${x.result}`)}</td>
                  <td className="py-1 pr-2 text-ink-soft">{x.notes || NO_VALUE}</td>
                  <td className="flex justify-end gap-1 py-1">
                    {flownTestId === x.id ? (
                      <span className="whitespace-nowrap text-[11px] text-ok-400">{t('bays.flying')}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          update({
                            primaryKg: x.chargeKg,
                            backupKg: suggestedBackup(x.chargeKg),
                            flownTestId: x.id,
                          })
                        }
                        aria-label={t('bays.flyThisOn', { date: x.date })}
                        className={smallButton('sm', 'soft', 'whitespace-nowrap')}
                      >
                        {t('bays.flyThis')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void remove(x.id)}
                      aria-label={t('bays.deleteTestOn', { date: x.date })}
                      className={smallButton('sm', 'soft')}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[11px] text-ink-faint">{t('bays.noTests')}</p>
      )}

      <div className="space-y-2 rounded-lg bg-raised/40 p-2 ring-1 ring-line/10">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t('bays.logTest')}</h4>
        <label className="flex items-center justify-between gap-3">
          <FieldLabel text={t('bays.date')} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`w-40 ${SELECT}`} />
        </label>
        <QNum
          label={t('bays.charge')}
          field="testCharge"
          kind="mass"
          u={u}
          stepSi={0.0001}
          minSi={0.0001}
          maxSi={0.1}
          required
          missing={chargeKg == null}
          value={chargeKg}
          onChange={setChargeKg}
        />
        <label className="flex items-center justify-between gap-3">
          <FieldLabel text={t('bays.result')} />
          <select value={result} onChange={(e) => setResult(e.target.value as TestResult)} className={`w-48 ${SELECT}`}>
            {TEST_RESULTS.map((r) => (
              <option key={r} value={r}>
                {t(`bays.result_${r}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <FieldLabel text={t('bays.notes')} />
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('bays.notesPlaceholder')}
            className={`mt-1 w-full ${SELECT}`}
          />
        </label>
        <p className="text-[11px] text-ink-faint">
          {t('bays.testPins', { pins: pinLabel(pins.count > 0 ? pins : null) })}
        </p>
        <button
          type="button"
          disabled={chargeKg == null || !date}
          onClick={log}
          className={smallButton('sm', 'ink', 'w-full')}
        >
          {t('bays.log')}
        </button>
      </div>
    </div>
  );
}
