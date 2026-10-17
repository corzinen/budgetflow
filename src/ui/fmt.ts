export const usd = (v: number | null | undefined) =>
  v === null || v === undefined || !isFinite(v) ? 'N/A' : (v < 0 ? '−$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US');
export const usdK = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);
export const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined || !isFinite(v) ? 'N/A' : `${(v * 100).toFixed(d)}%`);
export const x2 = (v: number | null | undefined) => (v === null || v === undefined || !isFinite(v) ? 'N/A' : `${v.toFixed(2)}x`);
