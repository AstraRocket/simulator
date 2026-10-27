import { describe, expect, it } from 'vitest';
import {
  CROSS_SECTIONS,
  FINISHES,
  FINISH_CODES,
  LOCATION_CODES,
  LOCATION_METHODS,
  MATT,
  RING_TYPES,
  RING_USAGE,
  SHAPES,
  SHAPE_CODES,
  TIP_SHAPE_CODES,
} from '../../../src/services/files/rocksim/schema';

/**
 * The `.rkt` reader and writer share one schema: each code table is held in
 * the reader's order and the writer's codes are built from it. The writer's
 * codes are pinned here to the ones desktop writes, and every token the writer
 * emits reads back as itself.
 */
describe('the RockSim schema', () => {
  it('writes the codes desktop writes', () => {
    expect(Object.fromEntries(SHAPE_CODES)).toEqual({
      conical: 0,
      ogive: 1,
      ellipsoid: 3,
      power: 4,
      parabolic: 5,
      haack: 6,
    });
    expect(Object.fromEntries(FINISH_CODES)).toEqual({ polished: 0, smooth: 1, normal: 2, unfinished: 3 });
    expect(MATT).toBe(2);
    expect(Object.fromEntries(LOCATION_CODES)).toEqual({ top: 0, absolute: 1, bottom: 2, middle: 0, after: 0 });
    expect(Object.fromEntries(TIP_SHAPE_CODES)).toEqual({ square: 0, rounded: 1, airfoil: 2 });
    expect(Object.fromEntries(RING_USAGE)).toEqual({ centeringring: 0, bulkhead: 1, engineblock: 2, tubecoupler: 4 });
  });

  it('reads every written code back as the token that wrote it', () => {
    for (const [shape, code] of SHAPE_CODES) expect(SHAPES[code]).toBe(shape);
    for (const [finish, code] of FINISH_CODES) expect(FINISHES[code]).toBe(finish);
    for (const [cross, code] of TIP_SHAPE_CODES) expect(CROSS_SECTIONS[code]).toBe(cross);
    for (const [type, code] of RING_USAGE) expect(RING_TYPES[code]).toBe(type);
    for (const method of LOCATION_METHODS) expect(LOCATION_METHODS[LOCATION_CODES.get(method)!]).toBe(method);
  });
});
