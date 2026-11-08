import type { ComponentNode } from '../../engine/openRocketEngine';

export function partName(
  node: ComponentNode,
  i: number,
  t: (k: string, opts?: Record<string, unknown>) => string,
): string {
  const own = typeof node.name === 'string' ? node.name.trim() : '';
  return own || t('configs.partNumbered', { part: t(`part.${node.type}`), n: i + 1 });
}
