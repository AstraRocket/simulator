import { readDecimal } from '../numberText';
import { escapeXml } from '../xmlUtil';

/** One line of a nested element, its depth relative to where the caller writes it. */
export type XmlLine = readonly [depth: number, text: string];

export const leaf = (depth: number, tag: string, value: string | number): XmlLine => [
  depth,
  `<${tag}>${escapeXml(String(value))}</${tag}>`,
];

/** `el`'s direct child named `tag`, in any letter case. */
export const childEl = (el: Element, tag: string): Element | undefined =>
  Array.from(el.children).find((c) => c.tagName.toLowerCase() === tag);

export const childrenEl = (el: Element, tag: string): Element[] =>
  Array.from(el.children).filter((c) => c.tagName.toLowerCase() === tag);

/** The child's text, or undefined when it is missing. */
export const childText = (el: Element, tag: string): string | undefined => childEl(el, tag)?.textContent ?? undefined;

/** The child's number, undefined when it is missing, and NaN when it is not a number, so a validator refuses it. */
export function childNum(el: Element, tag: string): number | undefined {
  const t = childText(el, tag)?.trim();
  return t === undefined ? undefined : readDecimal(t);
}
