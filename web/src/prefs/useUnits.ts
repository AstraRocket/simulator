import { useMemo } from 'react';
import { useSettings } from '../state/useSettings';
import { fmtNum, shortDigits, withUnit } from '../i18n/format';
import { NO_VALUE } from '../i18n/noValue';
import {
  degToRad,
  FAR_DISTANCE_UNIT,
  NEAR_DISTANCE_UNIT,
  ladderDigits,
  niceStep,
  siToUi,
  siToUiDelta,
  uiToSi,
  unitFor,
  type Quantity,
  type UnitSelection,
} from './units';
import { siEntry } from './entryValue';

function format(v: number, digits?: number): string {
  if (!Number.isFinite(v)) return NO_VALUE;
  return fmtNum(v, digits ?? ladderDigits(v));
}

/** A map span in the far unit of `distanceSym` (km, mi), or the near one (m, ft) below 1: never "0 km". */
export function fmtSpan(distanceSym: string, meters: number): string {
  const far = FAR_DISTANCE_UNIT[distanceSym] ?? distanceSym;
  const big = siToUi('distance', far, meters);
  if (big >= 1) return withUnit(fmtNum(big, shortDigits(big)), far);
  const near = NEAR_DISTANCE_UNIT[distanceSym] ?? distanceSym;
  return withUnit(fmtNum(siToUi('distance', near, meters), 0), near);
}

/** Outside React too: text built once, such as a load note, in the units chosen at the time. */
export function fmtSymIn(q: Quantity, sym: string, si: number, digits?: number): string {
  return withUnit(Number.isFinite(si) ? format(siToUi(q, sym, si), digits) : NO_VALUE, sym);
}

export interface FieldUnit {
  sym: string;
  toUi: (si: number) => number;
  /** Can overflow; data entry uses {@link FieldUnit.toSi}. */
  fromUi: (ui: number) => number;
  toSi: (ui: number | null | undefined, then?: (si: number) => number) => number | null;
  fmt: (si: number, digits?: number) => string;
  fmtSym: (si: number, digits?: number) => string;
  step: (si: number) => number;
}

export interface Units {
  all: UnitSelection;
  sym: (q: Quantity, scope?: string) => string;
  toUi: (q: Quantity, si: number) => number;
  /** Can overflow; data entry uses {@link Units.toSi}. */
  fromUi: (q: Quantity, ui: number) => number;
  toSi: (q: Quantity, ui: number | null | undefined, then?: (si: number) => number) => number | null;
  fmt: (q: Quantity, si: number, digits?: number) => string;
  fmtSym: (q: Quantity, si: number, digits?: number) => string;
  step: (q: Quantity, si: number) => number;
  /** Ignores the temperature offset; use `toUi` for one reading. */
  factor: (q: Quantity) => number;
  plain: (q: Quantity) => FieldUnit;
  /** A plain function, not a hook, because fields render in loops. */
  at: (scope: string, q: Quantity) => FieldUnit;
}

export function groundDistanceNumber(fu: FieldUnit, m: number): string {
  const v = fu.toUi(m);
  return fmtNum(v, Math.abs(v) >= 100 ? 0 : 1);
}

export function fmtGroundDistance(fu: FieldUnit, m: number): string {
  return withUnit(groundDistanceNumber(fu, m), fu.sym);
}

/** `deg` is in degrees, not radians. */
export function fmtDegrees(u: Pick<Units, 'fmtSym' | 'sym'>, deg: number, degDigits = 0): string {
  return u.fmtSym('angle', degToRad(deg), u.sym('angle') === '°' ? degDigits : degDigits + 2);
}

/** Formats through fmtNum, since the decimal separator is per language. */
export function useUnits(): Units {
  const { settings } = useSettings();
  const { units, unitOverrides } = settings;
  return useMemo(() => {
    const bind = (q: Quantity, sym: string): FieldUnit => {
      const fmt = (si: number, digits?: number) =>
        Number.isFinite(si) ? format(siToUi(q, sym, si), digits) : NO_VALUE;
      return {
        sym,
        toUi: (si) => siToUi(q, sym, si),
        fromUi: (ui) => uiToSi(q, sym, ui),
        toSi: (ui, then) => siEntry(q, sym, ui, then),
        fmt,
        fmtSym: (si, digits) => fmtSymIn(q, sym, si, digits),
        step: (si) => niceStep(siToUiDelta(q, sym, si)),
      };
    };
    const at = (scope: string, q: Quantity): FieldUnit => bind(q, unitFor(units, unitOverrides, q, scope));
    return {
      all: units,
      sym: (q, scope) => unitFor(units, unitOverrides, q, scope),
      toUi: (q, si) => bind(q, units[q]).toUi(si),
      fromUi: (q, ui) => bind(q, units[q]).fromUi(ui),
      toSi: (q, ui, then) => bind(q, units[q]).toSi(ui, then),
      fmt: (q, si, digits) => bind(q, units[q]).fmt(si, digits),
      fmtSym: (q, si, digits) => bind(q, units[q]).fmtSym(si, digits),
      step: (q, si) => bind(q, units[q]).step(si),
      factor: (q) => siToUiDelta(q, units[q], 1),
      plain: (q) => bind(q, units[q]),
      at,
    };
  }, [units, unitOverrides]);
}
