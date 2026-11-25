import type { ComponentNode } from '../../engine/openRocketEngine';

// For the flight view alone: the kernel has no airframe joints that open.
export const OPENS_AT_KEY = 'opensAt';
export const OPENS_AT = ['auto', 'front', 'back', 'closed'] as const;
export type OpensAt = (typeof OPENS_AT)[number];

export const isOpensAt = (v: unknown): v is OpensAt => OPENS_AT.some((o) => o === v);

/** Which end of its bay a recovery device opens. */
export function opensAt(device: ComponentNode): OpensAt {
  const v = device[OPENS_AT_KEY];
  return isOpensAt(v) ? v : 'auto';
}
