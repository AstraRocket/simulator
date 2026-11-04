import type { MotorSpec } from '../../engine/openRocketEngine';
import type { Simulation } from './simulations';
import { launchLimitViolations, limitText, type LimitViolation } from './safetyLimits';
import type { PowerClass } from './powerClass';
import type { UnitSymbols } from '../../prefs/units';
import { missingRequired, type RequiredLaunchKey } from './requiredLaunch';
import { badDimensions, overturnedFins, type BadDimension, type NamedPart } from '../design/requiredComponent';
import { findMounts } from '../design/treeEdit';
import { duplicateAltitudeRows } from './windLevels';
import { hasUsableCurve } from '../motors/motorCurve';
import type { RocketTree } from '../../engine/openRocketEngine';
import { fmtList, partLabel } from '../../i18n/format';
import { keyedText, type Keyed } from '../../i18n/keyedError';

// Must match the builder's predicate, or a one-sample motor passes here and builds an empty mount.
export const hasThrustCurve = (m: MotorSpec | undefined | null): boolean => hasUsableCurve(m);

export type UnflyableReason =
  | { kind: 'noMotor' }
  | { kind: 'incomplete'; missing: RequiredLaunchKey[] }
  | { kind: 'windProfile' }
  | { kind: 'limits'; violations: LimitViolation[] };

export interface Unflyable {
  id: string;
  name: string;
  reason: UnflyableReason;
}

export function unflyable(sim: Simulation, motor: MotorSpec | undefined, cls: PowerClass): UnflyableReason | null {
  if (!hasThrustCurve(motor)) return { kind: 'noMotor' };
  const missing = missingRequired(sim.launch);
  if (missing.length) return { kind: 'incomplete', missing };
  if (duplicateAltitudeRows(sim.launch.windLevels ?? []).length) return { kind: 'windProfile' };
  const violations = launchLimitViolations(sim.launch, cls);
  return violations.length ? { kind: 'limits', violations } : null;
}

export function unflyableSims(
  sims: Simulation[],
  motorOf: (sim: Simulation) => MotorSpec | undefined,
  classOf: (sim: Simulation) => PowerClass,
): Unflyable[] {
  const out: Unflyable[] = [];
  for (const sim of sims) {
    const reason = unflyable(sim, motorOf(sim), classOf(sim));
    if (reason) out.push({ id: sim.id, name: sim.name, reason });
  }
  return out;
}

export function unflyableText(
  u: Unflyable,
  t: (key: string, vars?: Record<string, unknown>) => string,
  units: UnitSymbols,
): string {
  if (u.reason.kind === 'noMotor') return t('sim.noMotorNamed', { name: u.name });
  if (u.reason.kind === 'incomplete') {
    const fields = fmtList(u.reason.missing.map((k) => t(`launch.field.${k}`)));
    return t('sim.incomplete', { name: u.name, fields });
  }
  if (u.reason.kind === 'windProfile') return t('sim.windProfile', { name: u.name });
  // Joined through a key: not every language spaces sentences.
  return u.reason.violations
    .map((v) => limitText(v, t, units))
    .reduce((text, next) => t('limits.sentenceJoin', { first: text, next }), t('limits.refused', { name: u.name }));
}

export type DesignBlocker =
  { kind: 'noMount' } | { kind: 'badGeometry'; bad: BadDimension[] } | { kind: 'finCant'; fins: NamedPart[] };

export function designBlocker(tree: RocketTree): DesignBlocker | null {
  if (findMounts(tree).length === 0) return { kind: 'noMount' };
  const bad = badDimensions(tree);
  if (bad.length) return { kind: 'badGeometry', bad };
  const fins = overturnedFins(tree);
  return fins.length ? { kind: 'finCant', fins } : null;
}

export function designBlockerText(
  b: DesignBlocker,
  t: (key: string, vars?: Record<string, unknown>) => string,
): string {
  if (b.kind === 'noMount') return t('sim.noMount');
  if (b.kind === 'finCant') {
    const parts = b.fins.map((f) => t('sim.finCantPart', { name: partLabel(t, f) })).join(t('sim.badGeometryPartSep'));
    return t('sim.finCant', { parts });
  }
  const byPart = new Map<string, string[]>();
  for (const d of b.bad) {
    const name = partLabel(t, d);
    const fields = byPart.get(name) ?? [];
    fields.push(t(`part.field.${d.field}`));
    byPart.set(name, fields);
  }
  const parts = [...byPart]
    .map(([name, fields]) => t('sim.badGeometryPart', { name, fields: fields.join(t('sim.badGeometryFieldSep')) }))
    .join(t('sim.badGeometryPartSep'));
  return t('sim.badGeometry', { parts });
}

export function buildFailureText(
  res: { error: string | Keyed; bad?: BadDimension[]; fins?: NamedPart[] },
  t: (key: string, vars?: Record<string, unknown>) => string,
): string {
  if (res.bad?.length) return designBlockerText({ kind: 'badGeometry', bad: res.bad }, t);
  if (res.fins?.length) return designBlockerText({ kind: 'finCant', fins: res.fins }, t);
  return typeof res.error === 'string' ? res.error : keyedText(res.error, t);
}
