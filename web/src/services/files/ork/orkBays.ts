import type { ComponentNode } from '../../../engine/openRocketEngine';
import { BAYS_KEY, baysOf, isTubeBays } from '../../flight/recoveryBays';
import { MAIN_DEVICE_KEY } from '../../design/treeEdit';
import { escapeXml } from '../xmlUtil';

/**
 * A body tube's recovery bay records in the `.ork`: one element inside the
 * tube's own, holding the records as JSON (`recoveryBays`).
 *
 * The tube's own element, not one beside `<rocket>`, so the records move with
 * the tube and find it again with no id: the file's part ids are written fresh
 * on every save and read fresh on every load. JSON rather than an element tree
 * because nothing but this app reads it, and its shape is checked on the way in
 * (`isTubeBays`) exactly as a stored one is.
 *
 * Desktop OpenRocket does not know the element. It reads past it, and drops it
 * if it saves the file itself, which is why the records are also kept in the
 * browser (`bayStore`).
 */

/** The element's name. Lower case, as every `.ork` tag is. */
const BAYS_TAG = 'astrarocketbays';

/** The records in `el`'s own bays element, or undefined for none or a malformed one. */
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

/** The bays element for `node`, or null when it carries no records. */
export function baysXml(node: ComponentNode): string | null {
  const bays = baysOf(node);
  if (!Object.keys(bays).length) return null;
  return `<${BAYS_TAG}>${escapeXml(JSON.stringify(bays))}</${BAYS_TAG}>`;
}

export { BAYS_KEY };

/**
 * A dual-deployment stage's picked main (`MAIN_DEVICE_KEY`), written inside
 * the recovery device's own element as `true`, for the same reasons as the
 * bays: desktop OpenRocket has only the drogue flag, reads past this, and drops
 * it if it saves the file, when the main falls back to the stage's first other
 * device.
 */
const MAIN_TAG = 'astrarocketmain';

/** Whether `el` is a recovery device picked as its stage's main. */
export function readMainDevice(el: Element): boolean {
  const child = Array.from(el.children).find((c) => c.tagName.toLowerCase() === MAIN_TAG);
  return (child?.textContent ?? '').trim().toLowerCase() === 'true';
}

/** The main element for `node`, or null when it is not picked. */
export function mainDeviceXml(node: ComponentNode): string | null {
  return node[MAIN_DEVICE_KEY] === true ? `<${MAIN_TAG}>true</${MAIN_TAG}>` : null;
}

export { MAIN_DEVICE_KEY };
