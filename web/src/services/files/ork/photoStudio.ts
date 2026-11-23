import { escapeXml } from '../xmlUtil';
import { PHOTO_COLOR_ELEMENTS, PHOTO_ELEMENT_ORDER, PHOTO_TEXT_ELEMENTS } from '../../design/photoSettings';
import type { OrkWriter } from './exportWriter';

/** `PhotoStudioHandler`: each known element's text, or a color's channels as `r g b a`. */
export function readPhotoStudio(docEl: Element): Record<string, string> | undefined {
  const el = docEl.querySelector(':scope > photostudio');
  if (!el) return undefined;
  const out: Record<string, string> = {};
  for (const child of Array.from(el.children)) {
    const name = child.tagName;
    if (PHOTO_TEXT_ELEMENTS.has(name)) out[name] = child.textContent ?? '';
    else if (PHOTO_COLOR_ELEMENTS.has(name)) {
      const [r, g, b] = ['red', 'green', 'blue'].map((a) => child.getAttribute(a));
      // A missing channel drops the color, as `getColor` does; a missing alpha is opaque.
      if (r != null && g != null && b != null) out[name] = `${r} ${g} ${b} ${child.getAttribute('alpha') ?? '255'}`;
    }
  }
  return out;
}

/** `OpenRocketSaver.savePhotoSettings` and `PhotoStudioSaver.getElements`. */
export function photoStudioXml(w: OrkWriter, depth: number, map: Readonly<Record<string, string>> | undefined): void {
  if (!map) return;
  w.emit(depth, '<photostudio>');
  for (const name of PHOTO_ELEMENT_ORDER) {
    if (!Object.hasOwn(map, name)) continue;
    const v = map[name]!;
    if (!PHOTO_COLOR_ELEMENTS.has(name)) {
      w.emit(depth + 1, `<${name}>${escapeXml(v)}</${name}>`);
      continue;
    }
    const c = v.split(' ');
    // `emitColor`: an unreadable color is written empty.
    if (c.length >= 4 && c.every((x) => /^[+-]?\d+$/.test(x))) {
      w.emit(depth + 1, `<${name} red="${c[0]}" green="${c[1]}" blue="${c[2]}" alpha="${c[3]}"/>`);
    } else w.emit(depth + 1, `<${name}></${name}>`);
  }
  w.emit(depth, '</photostudio>');
}
