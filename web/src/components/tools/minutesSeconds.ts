/** m:ss, rounded to the whole second before splitting. */
export function minutesSeconds(s: number): string {
  const total = Math.round(s);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
