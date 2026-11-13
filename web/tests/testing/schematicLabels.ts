import type { ComponentNode } from '../../src/engine/openRocketEngine';
import en from '../../src/i18n/locales/en.json';

const TAGS: Record<string, string> = en.schematic.tag;
const NAMES: Record<string, unknown> = en.part;

/** The English labels a drawing test finds its shapes by; the app passes translated ones. */
export const ENGLISH_LABELS = {
  partName: (n: ComponentNode): string =>
    (typeof n.name === 'string' && n.name.trim()) ||
    (typeof NAMES[n.type] === 'string' ? (NAMES[n.type] as string) : n.type),
  typeTag: (type: string): string => TAGS[type] ?? type,
};
