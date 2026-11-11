/**
 * Statistical forecasting on monthly demand.
 * Candidate models are back-tested one step ahead over the last `holdout` months; the lowest MAPE wins.
 *  SMA3     simple moving average of 3 months
 *  SES      single exponential smoothing (α = 0.3)
 *  HOLT     double exponential smoothing — level + trend (α = 0.4, β = 0.2), trend damped (φ = 0.9)
 *  SEASONAL trend-adjusted seasonal naive (same month last year × recent growth), from ≥ 15 months of history
 * The RMSE of the back-test errors is the monthly forecast-error σ used for safety stock.
 */
export type Fc = { method: string; forecast: number[]; mape: number | null; rmse: number; fitted: (number | null)[] };
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

type Model = { name: string; minLen: number; fit: (h: number[], ahead: number) => number[] };
const sma3: Model = { name: 'SMA3', minLen: 3, fit: (h, k) => Array(k).fill(mean(h.slice(-3))) };
const ses: Model = { name: 'SES', minLen: 3, fit: (h, k) => { let l = h[0]; for (const x of h.slice(1)) l = 0.3 * x + 0.7 * l; return Array(k).fill(l); } };
const holtCore = (h: number[], k: number, a = 0.4, b = 0.2, phi = 0.9) => {
  let l = h[0], t = h.length > 1 ? h[1] - h[0] : 0;
  for (const x of h.slice(1)) { const lp = l; l = a * x + (1 - a) * (l + phi * t); t = b * (l - lp) + (1 - b) * phi * t; }
  const out: number[] = []; let damp = 0; for (let i = 1; i <= k; i++) { damp += phi ** i; out.push(Math.max(0, l + damp * t)); } return out;
};
const holt: Model = { name: 'HOLT', minLen: 6, fit: holtCore };
const seasonal: Model = { name: 'SEASONAL', minLen: 15, fit: (h, k) => {
  // trend-adjusted seasonal naive: same month last year × (last 3 months ÷ same 3 months a year earlier);
  // with ≥ 27 months the two previous years are averaged, which damps one-off spikes
  const n = h.length, s3 = (from: number) => h.slice(from, from + 3).reduce((a, b) => a + b, 0);
  const ratio = (lag: number) => { const prev = s3(n - 3 - lag); return prev > 0 ? Math.min(2, Math.max(0.5, s3(n - 3) / prev)) : 1; };
  return Array.from({ length: k }, (_, j) => {
    const y1 = h[n - 12 + (j % 12)] * ratio(12);
    return Math.max(0, n >= 27 ? (y1 + h[n - 24 + (j % 12)] * ratio(24)) / 2 : y1);
  });
} };
const MODELS = [sma3, ses, holt, seasonal];

export function forecast(history: number[], ahead = 6, holdout = 6): Fc {
  const h = history.map(x => Math.max(0, x));
  if (h.length < 3) { const m = mean(h); return { method: 'NAIVE', forecast: Array(ahead).fill(m), mape: null, rmse: m * 0.5, fitted: [] }; }
  let best: Fc | null = null;
  for (const m of MODELS) {
    if (h.length < m.minLen + 2) continue;
    const start = Math.max(m.minLen, h.length - holdout); const errs: number[] = [], ape: number[] = [], fitted: (number | null)[] = Array(start).fill(null);
    for (let i = start; i < h.length; i++) { const f = m.fit(h.slice(0, i), 1)[0]; fitted.push(f); errs.push(h[i] - f); if (h[i] > 0) ape.push(Math.abs(h[i] - f) / h[i]); }
    const mape = ape.length ? (mean(ape) * 100) : null, rmse = Math.sqrt(mean(errs.map(e => e * e)));
    const cand: Fc = { method: m.name, forecast: m.fit(h, ahead), mape: mape == null ? null : Math.round(mape * 100) / 100, rmse, fitted };
    if (!best || (cand.mape ?? 1e9) < (best.mape ?? 1e9)) best = cand;
  }
  return best!;
}

/** Inverse standard normal (Acklam's rational approximation, |error| < 1.2e-9) — service level % → z */
export function zFor(serviceLevelPct: number) {
  const p = Math.min(0.9999, Math.max(0.5, serviceLevelPct / 100));
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  if (p > 0.97575) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
/** Safety stock = z · σ(monthly forecast error) · √(lead time in months) */
export const safetyStock = (sl: number, sigmaMonthly: number, leadDays: number) => Math.max(0, zFor(sl) * sigmaMonthly * Math.sqrt(Math.max(leadDays, 1) / 30));
/** Lot sizing: at least the need, at least the MOQ, rounded up to the order multiple */
export const lotSize = (need: number, moq: number, multiple: number) => { const q = Math.max(need, moq); return Math.ceil(q / multiple - 1e-9) * multiple; };
