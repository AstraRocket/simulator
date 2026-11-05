import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../state/useSettings';
import { fmtNum, fmtPercent } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import type { ComponentMass, AeroSweep } from '../../engine/openRocketEngine';
import {
  columnMax,
  dragRows,
  dragTotals,
  heat,
  massIndex,
  nearestSampleIndex,
  rollRows,
  stabilityRows,
  unitDigits,
  type HeatStyle,
} from './aeroTables';
import { ToggleButton } from '../common/ToggleButton';

// Named apart from aeroTables.ts: names differing only by case collide on a case-insensitive filesystem.

function HeatRamp({ top, style }: { top: number; style: HeatStyle }) {
  return (
    <span className="flex overflow-hidden rounded-sm ring-1 ring-line/10">
      {[0.2, 0.4, 0.6, 0.8, 1].map((f) => (
        <span key={f} className="h-2.5 w-4" style={heat(f * top, top, style)} />
      ))}
    </span>
  );
}

function HeatLegend({ max, unit, style }: { max: number; unit: string; style: HeatStyle }) {
  const { t } = useTranslation();
  const { update } = useSettings();
  // `openrocket` is OpenRocket's fixed full-red-at-1.5; `sky` is the row set's max.
  const top = style === 'openrocket' ? 1.5 : max;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1.5 text-[10px] text-ink-faint">
      <span>{style === 'openrocket' ? t('aero.absolute') : t('aero.share')}</span>
      <HeatRamp top={top} style={style} />
      <span className="tabular-nums">
        0 &ndash; {fmtNum(top, 3)} {unit}
      </span>
      <span className="ml-auto flex items-center gap-1">
        {(['sky', 'openrocket'] as const).map((v) => (
          <ToggleButton
            key={v}
            active={style === v}
            onClick={() => update({ aeroHeat: v })}
            title={t('settings.aeroHeatNote')}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-line/10"
          >
            {t(v === 'sky' ? 'settings.aeroHeatSky' : 'settings.aeroHeatOr')}
          </ToggleButton>
        ))}
      </span>
    </div>
  );
}

/** A real sample, not an interpolation, so the numbers match the CSV exactly. */
function useSampleAt(machs: number[], mach: number): number {
  return useMemo(() => nearestSampleIndex(machs, mach), [machs, mach]);
}

function TableHead({ title, mach }: { title: string; mach: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-baseline gap-2 px-1 pb-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
      <span className="text-[10px] tabular-nums text-ink-faint">{t('aero.atMach', { mach: fmtNum(mach, 2) })}</span>
    </div>
  );
}

interface SweepTableProps {
  sweep: AeroSweep;
  machs: number[];
  mach: number;
}

const CELL = 'px-2 py-1 text-right tabular-nums';
const HEAD = 'px-2 py-1 text-right font-medium';

/** In the desktop's column order. */
const SPLIT = [
  { key: 'pressure', label: 'aero.pressure' },
  { key: 'base', label: 'aero.base' },
  { key: 'friction', label: 'aero.friction' },
] as const;
const NAME_CELL = 'px-2 py-1 text-left';

function SweepTable({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] text-ink-soft">
        <thead className="text-ink-faint">
          <tr className="border-b border-line/10">
            <th className="px-2 py-1 text-left font-medium">{t('aero.component')}</th>
            {head}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function PartRow({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-line/5 last:border-0">
      <td className={NAME_CELL}>{name}</td>
      {children}
    </tr>
  );
}

function WholeRocketRow({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <tr className="border-b border-line/10 font-semibold text-ink-strong">
      <td className={NAME_CELL}>{t('aero.wholeRocket')}</td>
      {children}
      <td className={CELL}>100%</td>
    </tr>
  );
}

export function ComponentTable({ sweep, machs, mach }: SweepTableProps) {
  const { t } = useTranslation();
  const heatStyle = useSettings().settings.aeroHeat;
  const i = useSampleAt(machs, mach);

  const { totalCd, unattributed, hasSplit, hasInstances } = useMemo(() => dragTotals(sweep, i), [sweep, i]);
  const pct = (v: number) => (totalCd ? fmtPercent((v / totalCd) * 100) : NO_VALUE);
  const rows = useMemo(() => dragRows(sweep, i, t), [sweep, i, t]);

  // Null means non-finite and must not print as a fabricated 0.
  const num = (v: number | null | undefined, digits = 3) => (v == null ? NO_VALUE : fmtNum(v, digits));

  return (
    <div className="rounded-lg bg-canvas/40 p-2 ring-1 ring-line/10">
      <TableHead title={t('aero.dragByComponent')} mach={machs[i] ?? 0} />
      {!!sweep.nonFinite && (
        // A column sum coerces null to 0, so without this the breakdown would silently stop adding up.
        <p className="px-2 pb-1 text-[11px] text-warn-400">{t('aero.nonFinite', { count: sweep.nonFinite })}</p>
      )}
      <SweepTable
        head={
          <>
            {hasSplit &&
              SPLIT.map((c) => (
                <th key={c.key} className={HEAD}>
                  {t(c.label)}
                </th>
              ))}
            {hasInstances && <th className={HEAD}>{t('aero.perInstance')}</th>}
            <th className={HEAD}>Cd</th>
            <th className={HEAD}>%</th>
          </>
        }
      >
        <WholeRocketRow>
          {hasSplit &&
            SPLIT.map((c) => (
              <td key={c.key} className={CELL} style={heat(sweep.powerOff[c.key][i] ?? 0, totalCd, heatStyle)}>
                {num(sweep.powerOff[c.key][i])}
              </td>
            ))}
          {hasInstances && <td className={CELL}>{NO_VALUE}</td>}
          <td className={CELL} style={heat(totalCd, totalCd, heatStyle)}>
            {num(totalCd)}
          </td>
        </WholeRocketRow>
        {rows.map((r) => (
          <PartRow key={r.key} name={r.name}>
            {hasSplit &&
              SPLIT.map((c) => (
                <td key={c.key} className={CELL} style={heat(r[c.key] ?? 0, totalCd, heatStyle)}>
                  {num(r[c.key])}
                </td>
              ))}
            {hasInstances && (
              <td className={CELL}>{r.instances > 1 ? `${num(r.cdInstance)} × ${r.instances}` : num(r.cdInstance)}</td>
            )}
            <td className={CELL} style={heat(r.cd, totalCd, heatStyle)}>
              {num(r.cd)}
            </td>
            <td className={`${CELL} text-ink-faint`}>{pct(r.cd)}</td>
          </PartRow>
        ))}
        {unattributed > 1e-6 && (
          <tr className="border-t border-line/10 text-ink-faint">
            <td className="px-2 py-1 text-left italic">{t('aero.unattributed')}</td>
            {hasSplit &&
              SPLIT.map((c) => (
                <td key={c.key} className={CELL}>
                  {NO_VALUE}
                </td>
              ))}
            {hasInstances && <td className={CELL}>{NO_VALUE}</td>}
            <td className={CELL}>{num(unattributed)}</td>
            <td className={CELL}>{pct(unattributed)}</td>
          </tr>
        )}
      </SweepTable>
      <HeatLegend max={totalCd} unit="Cd" style={heatStyle} />
      {unattributed > 1e-6 && (
        <p className="px-1 pt-1.5 text-[10px] leading-snug text-ink-faint">{t('aero.unattributedNote')}</p>
      )}
      {!hasSplit && <p className="px-1 pt-1.5 text-[10px] leading-snug text-ink-faint">{t('aero.splitUnavailable')}</p>}
    </div>
  );
}

/** Barrowman reports a fin set's CNa for the whole set, so unlike drag there is no per-instance column. */
export function StabilityTable({
  sweep,
  machs,
  masses,
  mach,
  lengthUnit,
  lengthFactor,
  massUnit,
  massFactor,
  bodyLen,
  aeroLen,
}: SweepTableProps & {
  masses: ComponentMass[];
  lengthUnit: string;
  lengthFactor: number;
  massUnit: string;
  massFactor: number;
  /** m; 0 drops the column. */
  bodyLen: number;
  /** m, OpenRocket's `PercentageOfLengthUnit` denominator; 0 drops the column. */
  aeroLen: number;
}) {
  const { t } = useTranslation();
  const heatStyle = useSettings().settings.aeroHeat;
  const i = useSampleAt(machs, mach);
  const hasCna = sweep.components.some((c) => c.cna);
  const totalCna = sweep.cna[i] ?? 0;
  // The `openrocket` ramp is an absolute Cd scale (full red at 1.5) and CNa runs to 15 or 20, so every row would clamp.
  const cnaShaded = heatStyle !== 'openrocket';

  const massOf = useMemo(() => massIndex(masses), [masses]);
  const hasMass = masses.length > 0;

  const rows = useMemo(() => stabilityRows(sweep, i, massOf, t), [sweep, i, massOf, t]);
  if (!hasCna) return null;

  const pct = (v: number) => (totalCna ? fmtPercent((v / totalCna) * 100) : NO_VALUE);
  const hasBodyLen = bodyLen > 0;
  const hasAeroLen = aeroLen > 0;
  const lenDigits = unitDigits(lengthFactor, 1e-4);
  const massDigits = unitDigits(massFactor, 1e-4);
  const cpPctBody = (si: number) => fmtNum((si / bodyLen) * 100, 1);
  const cpPctAero = (si: number) => fmtNum((si / aeroLen) * 100, 1);

  return (
    <div className="rounded-lg bg-canvas/40 p-2 ring-1 ring-line/10">
      <TableHead title={t('aero.stabilityContribution')} mach={machs[i] ?? 0} />
      <SweepTable
        head={
          <>
            {hasMass && <th className={HEAD}>{t('aero.eachMass', { unit: massUnit })}</th>}
            {hasMass && <th className={HEAD}>{t('aero.totalMass', { unit: massUnit })}</th>}
            {hasMass && <th className={HEAD}>{t('aero.cg', { unit: lengthUnit })}</th>}
            <th className={HEAD}>{t('aero.cp', { unit: lengthUnit })}</th>
            {hasBodyLen && <th className={HEAD}>{t('aero.cp', { unit: t('aero.pctBody') })}</th>}
            {hasAeroLen && <th className={HEAD}>{t('aero.cp', { unit: t('aero.pctLength') })}</th>}
            <th className={HEAD}>CNα</th>
            <th className={HEAD}>%</th>
          </>
        }
      >
        <WholeRocketRow>
          {hasMass && <td className={CELL}>{NO_VALUE}</td>}
          {hasMass && <td className={CELL}>{NO_VALUE}</td>}
          {hasMass && <td className={CELL}>{NO_VALUE}</td>}
          <td className={CELL}>{fmtNum((sweep.cp[i] ?? 0) * lengthFactor, lenDigits)}</td>
          {hasBodyLen && <td className={CELL}>{cpPctBody(sweep.cp[i] ?? 0)}</td>}
          {hasAeroLen && <td className={CELL}>{cpPctAero(sweep.cp[i] ?? 0)}</td>}
          <td className={CELL} style={cnaShaded ? heat(totalCna, totalCna, 'sky') : undefined}>
            {fmtNum(totalCna, 2)}
          </td>
        </WholeRocketRow>
        {rows.map((r) => (
          <PartRow key={r.key} name={r.name}>
            {hasMass && (
              <td className={CELL}>{r.mass ? fmtNum(r.mass.eachMass * massFactor, massDigits) : NO_VALUE}</td>
            )}
            {hasMass && <td className={CELL}>{r.mass ? fmtNum(r.mass.mass * massFactor, massDigits) : NO_VALUE}</td>}
            {hasMass && <td className={CELL}>{r.mass ? fmtNum(r.mass.cg * lengthFactor, lenDigits) : NO_VALUE}</td>}
            <td className={CELL}>{fmtNum(r.cp * lengthFactor, lenDigits)}</td>
            {hasBodyLen && <td className={CELL}>{cpPctBody(r.cp)}</td>}
            {hasAeroLen && <td className={CELL}>{cpPctAero(r.cp)}</td>}
            <td className={CELL} style={cnaShaded ? heat(r.cna, totalCna, 'sky') : undefined}>
              {fmtNum(r.cna, 2)}
            </td>
            <td className={`${CELL} text-ink-faint`}>{pct(r.cna)}</td>
          </PartRow>
        ))}
      </SweepTable>
    </div>
  );
}

/** Shown even when all zero (uncanted, no roll rate), as desktop does. */
export function RollTable({ sweep, machs, mach }: SweepTableProps) {
  const { t } = useTranslation();
  const heatStyle = useSettings().settings.aeroHeat;
  const i = useSampleAt(machs, mach);
  const rows = useMemo(() => rollRows(sweep, i, t), [sweep, i, t]);
  if (rows.length === 0) return null;

  // One fin set would sit at full tint; each column scales to its own max.
  const shaded = rows.length > 1 && heatStyle !== 'openrocket';
  const maxForce = columnMax(rows.map((r) => r.force));
  const maxDamp = columnMax(rows.map((r) => r.damp));

  return (
    <div className="rounded-lg bg-canvas/40 p-2 ring-1 ring-line/10">
      <TableHead title={t('aero.rollDynamics')} mach={machs[i] ?? 0} />
      <SweepTable
        head={
          <>
            <th className={HEAD}>{t('aero.rollForcing')}</th>
            <th className={HEAD}>{t('aero.rollDamping')}</th>
          </>
        }
      >
        {rows.map((r) => (
          <PartRow key={r.key} name={r.name}>
            <td className={CELL} style={shaded ? heat(Math.abs(r.force), maxForce, 'sky') : undefined}>
              {fmtNum(r.force, 4)}
            </td>
            <td className={CELL} style={shaded ? heat(Math.abs(r.damp), maxDamp, 'sky') : undefined}>
              {fmtNum(r.damp, 4)}
            </td>
          </PartRow>
        ))}
      </SweepTable>
      {shaded && (
        <div className="flex items-center gap-1.5 px-1 pt-1.5 text-[10px] text-ink-faint">
          <span>{t('aero.columnShare')}</span>
          <HeatRamp top={1} style="sky" />
        </div>
      )}
      <p className="px-1 pt-1.5 text-[10px] leading-snug text-ink-faint">{t('aero.rollNote')}</p>
    </div>
  );
}
