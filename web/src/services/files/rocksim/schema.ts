import type { ComponentType } from '../../../engine/openRocketEngine';

/**
 * The RockSim (`.rkt`) schema constants the reader and the writer share, so the
 * two directions of one format cannot drift apart: the stage element names, the
 * code tables and the surface-density factor.
 *
 * Each code table is held once, in the reader's ordinal order (the code is the
 * index), and the writer's token-to-code maps are built from it. Some tables are
 * deliberately not symmetric, and say so where they are built.
 */

/**
 * RockSim surface density to kg/m², `ROCKSIM_TO_OPENROCKET_SURFACE_DENSITY`.
 *
 * The kernel's whole rocksim package converts inbound by dividing by its
 * constant (`BaseHandler.computeDensity` is `raw / type.asOpenRocket()`) and
 * outbound by multiplying (the `BasePartDTO(RocketComponent)` constructor). The
 * direction matters by a factor of a hundred, and the physics agrees with the
 * kernel: RockSim's unit is g/cm², and 1 g/cm² is 10 kg/m², so a nylon canopy at
 * 0.067 kg/m² sits in the file as 0.0067.
 */
export const SURFACE_DENSITY = 1 / 10;

/** RockSim numbers its stages from the nose down: 3 is the sustainer. */
export const STAGE_ELEMENTS = ['Stage3Parts', 'Stage2Parts', 'Stage1Parts'] as const;

/**
 * The mass and CG RockSim states on the design, nose down to match
 * {@link STAGE_ELEMENTS}. The masses are each stage's own; the CGs are the
 * stacks RockSim flies (the sustainer alone, the sustainer and the first
 * booster, then every stage), measured from the nose tip, which is how
 * `RockSimHandler` reads them and `RockSimSaver` writes them. RockSim uses
 * them only while `UseKnownMass` is set.
 */
export const STAGE_MASS_ELEMENTS = ['Stage3Mass', 'Stage2Mass', 'Stage1Mass'] as const;
export const STAGE_CG_ELEMENTS = ['Stage3CG', 'Stage32CG', 'Stage321CG'] as const;

/**
 * `RockSimNoseConeCode`, by code. RockSim's parabola (2) is a paraboloid of
 * revolution, r = R * sqrt(x / L), which is a power series of 1/2, and its
 * secant ogive (7) bulges past the tangent ogive, which the app cannot draw, so
 * it reads as a tangent ogive. Both shapes imply a parameter of their own
 * ({@link SHAPE_PARAMETERS}). A code RockSim does not define reads as the
 * parabola, `fromCode`'s default ({@link UNKNOWN_SHAPE_CODE}).
 */
export const SHAPES = ['conical', 'ogive', 'power', 'ellipsoid', 'power', 'parabolic', 'haack', 'ogive'] as const;

/** The shape parameter a code implies, ignoring the `ShapeParameter` RockSim writes beside it. */
export const SHAPE_PARAMETERS: Readonly<Record<number, number>> = { 2: 0.5, 7: 1 };

/** The secant ogive's code, which reads as a tangent ogive with a note. */
export const SECANT_OGIVE = 7;

/** The code an unknown `ShapeCode` reads as: the parabola, `RockSimNoseConeCode.fromCode`'s default. */
export const UNKNOWN_SHAPE_CODE = 2;

/** `RockSimFinishCode`, by code. */
export const FINISHES = ['polished', 'smooth', 'normal', 'unfinished'] as const;

/** `RockSimLocationMode`, by code: 0 front of parent, 1 from the nose tip, 2 back of parent. */
export const LOCATION_METHODS = ['top', 'absolute', 'bottom'] as const;

/** `TipShapeCode`, by code: a fin's cross section (`FinSetHandler.convertTipShapeCode`). */
export const CROSS_SECTIONS = ['square', 'rounded', 'airfoil'] as const;

/**
 * `RingHandler.endHandler`'s `UsageCode`, to the four OpenRocket ring types. Any
 * other code, a sleeve or one RockSim does not define, falls to the handler's
 * `else` and stays the centering ring it started as.
 */
export const RING_TYPES: Readonly<Record<number, ComponentType>> = {
  0: 'centeringring',
  1: 'bulkhead',
  2: 'engineblock',
  3: 'centeringring', // "Sleeve": `RingHandler` keeps it the centering ring it started as
  4: 'tubecoupler',
};

/** A code table read the other way: each token to the last code that reads as it. */
const toCodes = (codes: readonly string[]): ReadonlyMap<string, number> => new Map(codes.map((token, i) => [token, i]));

/**
 * The writer's `ShapeCode` by shape: the first code that reads as it, leaving
 * out the two that imply a parameter, as `RockSimNoseConeCode.toCode` does. So
 * a power series goes out as POWER_SERIES (4), keeping its exponent, and an
 * ogive as the tangent OGIVE (1).
 */
export const SHAPE_CODES: ReadonlyMap<string, number> = new Map(
  SHAPES.map((token, code) => [token, code] as const)
    .filter(([, code]) => SHAPE_PARAMETERS[code] === undefined)
    .reverse(),
);

/**
 * The writer's `FinishCode` by finish: RockSim's four, plus the app's other
 * finishes at the nearest of them by roughness, as `RockSimFinishCode.toCode`
 * writes them. The rough ones go out as unfinished (3, RockSim's roughest) and
 * the ones smoother than regular paint as polished (0, its smoothest). A
 * finish with no code at all goes out as matt (2), because a part with no
 * `FinishCode` opens in desktop with no finish at all.
 */
export const FINISH_CODES: ReadonlyMap<string, number> = new Map([
  ...toCodes(FINISHES),
  ['rough', 3],
  ['roughunfinished', 3],
  ['optimum', 0],
  ['finishpolished', 0],
  ['mirror', 0],
]);
export const MATT = FINISH_CODES.get('normal')!;

/**
 * The writer's `LocationMode` by placement method. RockSim has no middle or
 * after mode: middle is converted to a top offset when written, and after is
 * written as top with its offset, as desktop's BasePartDTO does, because
 * RockSim lays out a stage's parts in order.
 */
export const LOCATION_CODES: ReadonlyMap<string, number> = new Map([
  ...toCodes(LOCATION_METHODS),
  ['middle', 0],
  ['after', 0],
]);

/** The writer's `TipShapeCode` by cross section. */
export const TIP_SHAPE_CODES = toCodes(CROSS_SECTIONS);

/**
 * The writer's `UsageCode` by ring type: the first code that reads as each, so
 * a centering ring goes out as 0, not as the sleeve (3) that also reads as one.
 */
export const RING_USAGE: ReadonlyMap<string, number> = new Map(
  Object.entries(RING_TYPES)
    .reverse()
    .map(([code, type]) => [type, Number(code)]),
);
