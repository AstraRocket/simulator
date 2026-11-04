/**
 * Security: formula injection. Quoting does not stop it, and Excel splits on its locale's separator,
 * so every trigger that can start a cell gets a `'`. A plain number is exempt (`-80.6` must stay numeric).
 */
const NUMBER = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

const EMBEDDED_TRIGGER = /([,;\t\r\n] *)(?=[=+\-@\t\r])/g;

const LEADING_TRIGGER = /^ *[=+\-@\t\r]/;

export function neutralizeFormula(s: string): string {
  if (NUMBER.test(s)) return s;
  // Embedded first, so the `'` for a leading tab does not hide the trigger after it.
  const inner = s.replace(EMBEDDED_TRIGGER, "$1'");
  return LEADING_TRIGGER.test(inner) ? `'${inner}` : inner;
}

export function csvField(s: string, separator = ','): string {
  const safe = neutralizeFormula(s);
  const needsQuote = /[",;\t\r\n]/.test(safe) || (separator !== '' && safe.includes(separator));
  return needsQuote ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvQuoted(s: string): string {
  return `"${neutralizeFormula(s).replace(/"/g, '""')}"`;
}
