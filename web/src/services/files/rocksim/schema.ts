import type { ComponentType } from '../../../engine/openRocketEngine';

// Code tables are in the reader's order (code = index); some writer maps are deliberately asymmetric.

/** g/cm²: divide inbound, multiply outbound; the direction matters by a factor of a hundred. */
export const SURFACE_DENSITY = 1 / 10;

/** Nose down: 3 is the sustainer. */
export const STAGE_ELEMENTS = ['Stage3Parts', 'Stage2Parts', 'Stage1Parts'] as const;

/** Masses are per stage; CGs are of the cumulative stack from the nose tip. */
export const STAGE_MASS_ELEMENTS = ['Stage3Mass', 'Stage2Mass', 'Stage1Mass'] as const;
export const STAGE_CG_ELEMENTS = ['Stage3CG', 'Stage32CG', 'Stage321CG'] as const;

/** `RockSimNoseConeCode`; codes 2 and 7 imply a parameter ({@link SHAPE_PARAMETERS}). */
export const SHAPES = ['conical', 'ogive', 'power', 'ellipsoid', 'power', 'parabolic', 'haack', 'ogive'] as const;

/** Overrides the `ShapeParameter` RockSim writes beside these codes. */
export const SHAPE_PARAMETERS: Readonly<Record<number, number>> = { 2: 0.5, 7: 1 };

export const SECANT_OGIVE = 7;

/** `RockSimNoseConeCode.fromCode`'s default. */
export const UNKNOWN_SHAPE_CODE = 2;

export const FINISHES = ['polished', 'smooth', 'normal', 'unfinished'] as const;

export const LOCATION_METHODS = ['top', 'absolute', 'bottom'] as const;

export const CROSS_SECTIONS = ['square', 'rounded', 'airfoil'] as const;

export const RING_TYPES: Readonly<Record<number, ComponentType>> = {
  0: 'centeringring',
  1: 'bulkhead',
  2: 'engineblock',
  3: 'centeringring', // "Sleeve": `RingHandler` keeps it the centering ring it started as
  4: 'tubecoupler',
};

const toCodes = (codes: readonly string[]): ReadonlyMap<string, number> => new Map(codes.map((token, i) => [token, i]));

// Reversed so the first code per shape wins; parameter-implying codes are skipped (`RockSimNoseConeCode.toCode`).
export const SHAPE_CODES: ReadonlyMap<string, number> = new Map(
  SHAPES.map((token, code) => [token, code] as const)
    .filter(([, code]) => SHAPE_PARAMETERS[code] === undefined)
    .reverse(),
);

// Unmapped finishes go out as matt: a part with no `FinishCode` opens in desktop with no finish.
export const FINISH_CODES: ReadonlyMap<string, number> = new Map([
  ...toCodes(FINISHES),
  ['rough', 3],
  ['roughunfinished', 3],
  ['optimum', 0],
  ['finishpolished', 0],
  ['mirror', 0],
]);
export const MATT = FINISH_CODES.get('normal')!;

// RockSim has no middle or after mode; middle is converted to a top offset on write.
export const LOCATION_CODES: ReadonlyMap<string, number> = new Map([
  ...toCodes(LOCATION_METHODS),
  ['middle', 0],
  ['after', 0],
]);

export const TIP_SHAPE_CODES = toCodes(CROSS_SECTIONS);

// Reversed so a centering ring goes out as 0, not the sleeve (3).
export const RING_USAGE: ReadonlyMap<string, number> = new Map(
  Object.entries(RING_TYPES)
    .reverse()
    .map(([code, type]) => [type, Number(code)]),
);
