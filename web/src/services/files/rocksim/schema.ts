import type { ComponentType } from '../../../engine/openRocketEngine';

/**
 * The RockSim (`.rkt`) schema constants the reader and the writer share, so the
 * two directions of one format cannot drift apart: the stage element names, the
 * code tables and the surface-density factor.
 *
 * Each code table is held once, in the reader's ordinal order (the code is the
 * index), and the writer's token-to-code maps are built from it. Two tables are
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
 * The per-stage mass and CG RockSim states on the design, nose down to match
 * {@link STAGE_ELEMENTS}. The CG tags are not named alike: the sustainer's is
 * `Stage3CG` and the boosters' are `…CGAlone`, as `RockSimHandler` reads them.
 */
export const STAGE_MASS_ELEMENTS = ['Stage3Mass', 'Stage2Mass', 'Stage1Mass'] as const;
export const STAGE_CG_ELEMENTS = ['Stage3CG', 'Stage2CGAlone', 'Stage1CGAlone'] as const;

/**
 * `RockSimNoseConeCode`, by code. RockSim's PARABOLIC (2) really is
 * OpenRocket's ELLIPSOID, so both 2 and 3 read as an ellipsoid.
 */
export const SHAPES = ['conical', 'ogive', 'ellipsoid', 'ellipsoid', 'power', 'parabolic', 'haack'] as const;

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
 * The writer's `ShapeCode` by shape. RockSim has no separate ellipsoid, so the
 * last code that reads as one, ELLIPTICAL (3), is the one written.
 */
export const SHAPE_CODES = toCodes(SHAPES);

/**
 * The writer's `FinishCode` by finish. Every other finish goes out as matt (2),
 * as `RockSimFinishCode.toCode` writes it, because a part with no `FinishCode`
 * opens in desktop with no finish at all.
 */
export const FINISH_CODES = toCodes(FINISHES);
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
