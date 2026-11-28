import type { ComponentNode } from '../../../engine/openRocketEngine';
import { BAYS_KEY, baysOf, isTubeBays, type BayPins, type BayRecord, type TubeBays } from '../../flight/recoveryBays';
import { MAIN_DEVICE_KEY } from '../../design/treeEdit';
import { isOpensAt, opensAt, OPENS_AT_KEY, type OpensAt } from '../../flight/opensAt';
import { escapeXml } from '../xmlUtil';
import { BAYS_TAG, IGNORED_TAG, MAIN_TAG, OPENS_TAG } from './appTags';
import { IGNORED_KEY } from '../../design/engineTree';
import { childEl, childNum, childrenEl, childText, leaf, type XmlLine } from './xmlLines';

/**
 * Inside the tube's own element because part ids are fresh on every save and load. SI units, as the rest of the file:
 *
 *   <ejectionbays>
 *     <ejectionbay role="drogue">
 *       <bore>0.0536</bore> <length>0.3</length> <pressure>103421</pressure>
 *       <shearpins><count>3</count><size>2-56</size><strength>155.7</strength></shearpins>
 *       <primarycharge>0.0012</primarycharge> <backupcharge>0.0018</backupcharge> <flowntest>t1</flowntest>
 *       <groundtest id="t1"><date>YYYY-MM-DD</date><charge>0.0012</charge><shearpins>...</shearpins>
 *         <result>clean</result><notes>...</notes></groundtest>
 *     </ejectionbay>
 *   </ejectionbays>
 *
 * Every element but the ground tests is optional.
 */

const ROLES = ['drogue', 'main'] as const;

function pinsLines(depth: number, pins: BayPins): XmlLine[] {
  return [
    [depth, '<shearpins>'],
    leaf(depth + 1, 'count', pins.count),
    ...(pins.size ? [leaf(depth + 1, 'size', pins.size)] : []),
    leaf(depth + 1, 'strength', pins.forceN),
    [depth, '</shearpins>'],
  ];
}

const optLeaf = (depth: number, tag: string, v: number | string | undefined): XmlLine[] =>
  v === undefined ? [] : [leaf(depth, tag, v)];

function bayLines(role: string, r: BayRecord): XmlLine[] {
  return [
    [1, `<ejectionbay role="${role}">`],
    ...optLeaf(2, 'bore', r.boreM),
    ...optLeaf(2, 'length', r.lengthM),
    ...optLeaf(2, 'pressure', r.pressurePa),
    ...(r.pins ? pinsLines(2, r.pins) : []),
    ...optLeaf(2, 'primarycharge', r.primaryKg),
    ...optLeaf(2, 'backupcharge', r.backupKg),
    ...optLeaf(2, 'flowntest', r.flownTestId),
    ...r.tests.flatMap((t): XmlLine[] => [
      [2, `<groundtest id="${escapeXml(t.id)}">`],
      leaf(3, 'date', t.date),
      leaf(3, 'charge', t.chargeKg),
      ...(t.pins ? pinsLines(3, t.pins) : []),
      leaf(3, 'result', t.result),
      leaf(3, 'notes', t.notes),
      [2, '</groundtest>'],
    ]),
    [1, '</ejectionbay>'],
  ];
}

export function baysXml(node: ComponentNode): XmlLine[] {
  const bays = baysOf(node);
  const roles = ROLES.filter((r) => bays[r]);
  if (!roles.length) return [];
  return [[0, `<${BAYS_TAG}>`], ...roles.flatMap((r) => bayLines(r, bays[r]!)), [0, `</${BAYS_TAG}>`]];
}

function readPins(el: Element | undefined): BayPins | undefined {
  if (!el) return undefined;
  return {
    count: childNum(el, 'count') ?? NaN,
    size: (childText(el, 'size')?.trim() || null) as BayPins['size'],
    forceN: childNum(el, 'strength') ?? NaN,
  };
}

const defined = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

function readBay(el: Element): unknown {
  return defined({
    boreM: childNum(el, 'bore'),
    lengthM: childNum(el, 'length'),
    pressurePa: childNum(el, 'pressure'),
    pins: readPins(childEl(el, 'shearpins')),
    primaryKg: childNum(el, 'primarycharge'),
    backupKg: childNum(el, 'backupcharge'),
    flownTestId: childText(el, 'flowntest')?.trim(),
    tests: childrenEl(el, 'groundtest').map((t) => ({
      id: t.getAttribute('id') ?? '',
      date: childText(t, 'date')?.trim(),
      chargeKg: childNum(t, 'charge'),
      pins: readPins(childEl(t, 'shearpins')) ?? null,
      result: childText(t, 'result')?.trim(),
      notes: childText(t, 'notes') ?? '',
    })),
  });
}

/** A malformed record is dropped whole rather than loaded in part. */
export function readBays(el: Element): TubeBays | undefined {
  const child = childEl(el, BAYS_TAG);
  if (!child) return undefined;
  const parsed = Object.fromEntries(
    childrenEl(child, 'ejectionbay').map((b) => [b.getAttribute('role') ?? '', readBay(b)]),
  );
  return isTubeBays(parsed) && Object.keys(parsed).length ? parsed : undefined;
}

export { BAYS_KEY };

export function readMainDevice(el: Element): boolean {
  const child = childEl(el, MAIN_TAG);
  return (child?.textContent ?? '').trim().toLowerCase() === 'true';
}

export function mainDeviceXml(node: ComponentNode): string | null {
  return node[MAIN_DEVICE_KEY] === true ? `<${MAIN_TAG}>true</${MAIN_TAG}>` : null;
}

export { MAIN_DEVICE_KEY };

export function readOpensAt(el: Element): OpensAt | undefined {
  const child = childEl(el, OPENS_TAG);
  const v = (child?.textContent ?? '').trim().toLowerCase();
  return isOpensAt(v) && v !== 'auto' ? v : undefined;
}

export function opensAtXml(node: ComponentNode): string | null {
  const v = opensAt(node);
  return v === 'auto' ? null : `<${OPENS_TAG}>${v}</${OPENS_TAG}>`;
}

export { OPENS_AT_KEY };

export function flagXml(node: ComponentNode): string[] {
  const out: string[] = [];
  if (node[IGNORED_KEY] === true) out.push(`<${IGNORED_TAG}>true</${IGNORED_TAG}>`);
  return out;
}

const isTrue = (el: Element, tag: string): boolean =>
  (childEl(el, tag)?.textContent ?? '').trim().toLowerCase() === 'true';

export function readFlags(el: Element, node: ComponentNode): void {
  if (isTrue(el, IGNORED_TAG) && node.type !== 'stage') node[IGNORED_KEY] = true;
}
