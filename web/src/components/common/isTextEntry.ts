// Ctrl+Z in these is the browser's own field undo; other input types have none.
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);

export function isTextEntry(el: Element | null | undefined): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type);
  if (el.tagName === 'TEXTAREA') return true;
  // jsdom lacks `isContentEditable`, so fall back to the inherited attribute.
  return el.isContentEditable === true || el.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

export function takesArrowKeys(el: Element | null | undefined): boolean {
  if (isTextEntry(el)) return true;
  if (el instanceof HTMLSelectElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return !['checkbox', 'button', 'submit', 'reset', 'image', 'file', 'color', 'hidden'].includes(el.type);
}
