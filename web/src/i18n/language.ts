/** `es-MX` reads `es`. A three-letter base (`fil`) stays whole. */
export function baseLanguage(tag: string | undefined): string {
  return (tag || '').split('-')[0]!.toLowerCase();
}
