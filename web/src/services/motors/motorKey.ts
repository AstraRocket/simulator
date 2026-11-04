import type { CatalogMotor } from './motorDb';

/** `code` is needed: AeroTech's F67W and F67C are both "F67" in 29 mm. */
export const keyOf = (m: CatalogMotor) => `${m.manufacturer}|${m.designation}|${m.diameter}|${m.code ?? ''}`;
