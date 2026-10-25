/**
 * The base language of a BCP 47 tag, lowercase: `es-MX` reads `es`. A
 * three-letter base (`fil`) stays whole, where cutting at two letters would
 * name another language.
 */
export function baseLanguage(tag: string | undefined): string {
  return (tag || '').split('-')[0]!.toLowerCase();
}
