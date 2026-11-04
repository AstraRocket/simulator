import type { ComponentNode } from '../../../engine/openRocketEngine';
import { BAYS_KEY, baysOf, isTubeBays } from '../../flight/recoveryBays';
import { MAIN_DEVICE_KEY } from '../../design/treeEdit';
import { escapeXml } from '../xmlUtil';

/** Inside the tube's own element because part ids are fresh on every save and load. */
const BAYS_TAG = 'astrarocketbays';

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

const MAIN_TAG = 'astrarocketmain';

export function readMainDevice(el: Element): boolean {
  const child = Array.from(el.children).find((c) => c.tagName.toLowerCase() === MAIN_TAG);
  return (child?.textContent ?? '').trim().toLowerCase() === 'true';
}

export function mainDeviceXml(node: ComponentNode): string | null {
  return node[MAIN_DEVICE_KEY] === true ? `<${MAIN_TAG}>true</${MAIN_TAG}>` : null;
}

export { MAIN_DEVICE_KEY };
