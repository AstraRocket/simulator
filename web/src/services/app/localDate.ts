/** Today as `YYYY-MM-DD` in local time, not `toISOString` (UTC). */
export function localToday(): string {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}
