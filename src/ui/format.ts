// Number formatting used across the interface (en-US grouping, like the Excel tool).
export const fmt = (x: number | null | undefined, d = 0) =>
  x == null || !Number.isFinite(x) ? '–' : x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Smart precision: big numbers whole, small numbers with significant digits, tiny numbers in E notation. */
export function sig(x: number | null | undefined, digits = 3): string {
  if (x == null || !Number.isFinite(x)) return '–';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1000) return fmt(x, 0);
  if (a >= 100) return fmt(x, 1);
  if (a >= 1) return fmt(x, 2);
  if (a >= 0.001) return x.toPrecision(digits);
  return x.toExponential(2).replace('e', 'E');
}

export const tco2 = (kg: number | null | undefined, d = 1) => (kg == null ? '–' : fmt(kg / 1000, d));
export const pct = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? '–' : `${(x * 100).toFixed(d)}%`);
export const chg = (x: number | null | undefined, d = 1) =>
  x == null || !Number.isFinite(x) ? 'n/a' : `${x > 0 ? '▲' : x < 0 ? '▼' : ''} ${Math.abs(x * 100).toFixed(d)}%`.trim();
export const signed = (x: number, d = 1) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${fmt(Math.abs(x), d)}`;

export function parseNum(s: string): number | null {
  const t = s.replace(/[\s,]/g, '').replace('−', '-');
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

export function dateFmt(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
