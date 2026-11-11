// Date helpers on 'YYYY-MM-DD' strings (UTC-safe)
export const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // IST business day
export function addDays(d: string, n: number) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
export function addMonths(d: string, n: number) {
  const x = new Date(d + 'T00:00:00Z'); const day = x.getUTCDate();
  x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last)); return x.toISOString().slice(0, 10);
}
export function nextOccurrence(d: string, f: string) {
  switch (f) {
    case 'DAILY': return addDays(d, 1);
    case 'WEEKLY': return addDays(d, 7);
    case 'MONTHLY': return addMonths(d, 1);
    case 'QUARTERLY': return addMonths(d, 3);
    default: return addMonths(d, 12);
  }
}
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);
