import { nsKey } from '../../services/storage/storageKeys';
import { readLocalJson, writeLocalJson } from '../../services/storage/localPref';
import { withKey } from '../../services/app/objectKeys';

export type DialogSize = 'sm' | 'md' | 'lg' | '3xl' | '4xl' | '6xl';

const WIDTH: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl',
};

export const widthClass = (size: DialogSize): string => WIDTH[size];

// Not `w-screen`: the overlay keeps its padding at `lg` and up, so a viewport-wide panel overflows.
const EXPANDED = 'max-w-[96vw]';

const HEIGHT = 'max-h-[85vh]';
const HEIGHT_EXPANDED = 'max-h-[94vh]';

/** No runtime-built `h-[${n}px]` here: Tailwind never generates it; use `Dialog`'s `height` prop. */
export const sizeClasses = (size: DialogSize, expanded: boolean, fill = false): string => {
  const width = expanded ? EXPANDED : WIDTH[size];
  if (fill) return `${width} ${expanded ? 'h-[94vh]' : 'h-[85vh]'}`;
  return `${width} ${expanded ? HEIGHT_EXPANDED : HEIGHT}`;
};

export type DialogLayer = 'base' | 'over' | 'top';

export const layerClass: Record<DialogLayer, string> = {
  base: 'z-50',
  over: 'z-[60]',
  top: 'z-[70]',
};

const KEY = nsKey('dialogExpanded');

const isFlagMap = (v: unknown): v is Record<string, boolean> => !!v && typeof v === 'object' && !Array.isArray(v);

export function readExpanded(id: string): boolean {
  return readLocalJson(KEY, isFlagMap, {})[id] === true;
}

export function writeExpanded(id: string, expanded: boolean): void {
  writeLocalJson(KEY, withKey(readLocalJson(KEY, isFlagMap, {}), id, expanded ? true : null));
}
