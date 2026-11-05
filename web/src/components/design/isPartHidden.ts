import type { PartVisibility } from './PartVisibilityToggle';

export const isPartHidden = (visibility: PartVisibility | undefined, id: string | undefined): boolean =>
  !!id && !!visibility?.shownHidden.has(id);
