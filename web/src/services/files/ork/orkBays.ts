import type { ComponentNode } from '../../../engine/openRocketEngine';
import { BAYS_KEY, baysOf, isTubeBays } from '../../flight/recoveryBays';
import { MAIN_DEVICE_KEY } from '../../design/treeEdit';
import { isOpensAt, opensAt, OPENS_AT_KEY, type OpensAt } from '../../flight/opensAt';
import { escapeXml } from '../xmlUtil';
import { BAYS_TAG, MAIN_TAG, OPENS_TAG } from './appTags';

/** Inside the tube's own element because part ids are fresh on every save and load. */

export function readBays(el: Element): ComponentNode[string] {
  const child = Array.from(el.children).find((c) => c.tagName.toLowerCase() === BAYS_TAG);
  if (!child?.textContent) return undefined;
  try {
    const parsed: unknown = JSON.parse(child.textContent);
    return isTubeBays(parsed) && Object.keys(parsed).length ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function baysXml(node: ComponentNode): string | null {
  const bays = baysOf(node);
  if (!Object.keys(bays).length) return null;
  return `<${BAYS_TAG}>${escapeXml(JSON.stringify(bays))}</${BAYS_TAG}>`;
}

export { BAYS_KEY };

export function readMainDevice(el: Element): boolean {
  const child = Array.from(el.children).find((c) => c.tagName.toLowerCase() === MAIN_TAG);
  return (child?.textContent ?? '').trim().toLowerCase() === 'true';
}

export function mainDeviceXml(node: ComponentNode): string | null {
  return node[MAIN_DEVICE_KEY] === true ? `<${MAIN_TAG}>true</${MAIN_TAG}>` : null;
}

export { MAIN_DEVICE_KEY };

export function readOpensAt(el: Element): OpensAt | undefined {
  const child = Array.from(el.children).find((c) => c.tagName.toLowerCase() === OPENS_TAG);
  const v = (child?.textContent ?? '').trim().toLowerCase();
  return isOpensAt(v) && v !== 'auto' ? v : undefined;
}

export function opensAtXml(node: ComponentNode): string | null {
  const v = opensAt(node);
  return v === 'auto' ? null : `<${OPENS_TAG}>${v}</${OPENS_TAG}>`;
}

export { OPENS_AT_KEY };
