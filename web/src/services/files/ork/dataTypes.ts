import type { CustomExpression } from '../../flight/customExpressions';
import { escapeXml } from '../xmlUtil';
import type { OrkWriter } from './exportWriter';
import { MAX_PASSTHROUGH } from './importLimits';

/** `DatatypeHandler` and `CustomExpressionHandler`: only a `customexpression` type is read. */
export function readCustomExpressions(docEl: Element): CustomExpression[] {
  const out: CustomExpression[] = [];
  for (const el of Array.from(docEl.querySelectorAll(':scope > datatypes > type'))) {
    if (el.getAttribute('source') !== 'customexpression') continue;
    if (out.length === MAX_PASSTHROUGH) break;
    const field = (tag: string) => el.querySelector(`:scope > ${tag}`)?.textContent?.trim() ?? '';
    out.push({ name: field('name'), symbol: field('symbol'), unit: field('unit'), expression: field('expression') });
  }
  return out;
}

/** `OpenRocketSaver.saveCustomDatatypes`. */
export function customExpressionsXml(w: OrkWriter, depth: number, list: readonly CustomExpression[]): void {
  if (!list.length) return;
  w.emit(depth, '<datatypes>');
  for (const e of list) {
    w.emit(depth + 1, '<type source="customexpression">');
    w.emit(depth + 2, `<name>${escapeXml(e.name)}</name>`);
    w.emit(depth + 2, `<symbol>${escapeXml(e.symbol)}</symbol>`);
    // Required: desktop reads the attribute without checking for it.
    w.emit(depth + 2, `<unit unittype="auto">${escapeXml(e.unit)}</unit>`);
    w.emit(depth + 2, `<expression>${escapeXml(e.expression)}</expression>`);
    w.emit(depth + 1, '</type>');
  }
  w.emit(depth, '</datatypes>');
}
