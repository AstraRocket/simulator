/** Alpha in `#rrggbbaa` is dropped. The 3-digit shorthand needs its `#`, as in CSS. */
export function parseHexColor(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = /^(?:#([0-9a-f]{3})|#?([0-9a-f]{6}|[0-9a-f]{8}))$/i.exec(raw.trim());
  if (!m) return null;
  const digits = m[1] ?? m[2]!;
  const six =
    digits.length === 3
      ? digits
          .split('')
          .map((c) => c + c)
          .join('')
      : digits.slice(0, 6);
  return Number.parseInt(six, 16);
}

export function hexOf(rgb: number, hash = true): string {
  return `${hash ? '#' : ''}${(rgb & 0xffffff).toString(16).padStart(6, '0')}`;
}

export const rgbChannels = (rgb: number): [number, number, number] => [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255];

export const packRgb = (r: number, g: number, b: number): number => ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
