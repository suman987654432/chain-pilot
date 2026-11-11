import { PoolClient } from 'pg';
import { one, query, tx } from '../db';
import { HttpError } from '../auth';
import { forecast, safetyStock } from '../forecast';
import { today } from '../dates';

export const monthStart = (d: string) => d.slice(0, 7) + '-01';
export const addMonth = (p: string, n: number) => { const d = new Date(p + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
export const HORIZON = 6;          // months forecast
export const REVIEW_DAYS = 7;      // weekly planning cycle → protection interval = lead time + review period

/** Replenishment lead time (days) for an item at a location: transit from the parent location, production, or supplier lead time */
export async function leadTimes(org: number) {
  const rows = await query(`SELECT il.item_id, il.location_id, i.type, i.make_buy, i.lead_time_days, l.supply_from, l.transit_days,
                                   (SELECT si.lead_time_days FROM supplier_items si WHERE si.item_id=i.id AND si.preferred) AS sup_lt
                              FROM item_locations il JOIN items i ON i.id=il.item_id JOIN locations l ON l.id=il.location_id WHERE i.org_id=$1`, [org]);
  const m = new Map<string, number>();
  for (const r of rows) m.set(`${r.item_id}:${r.location_id}`, r.supply_from && ['FINISHED', 'TRADED'].includes(r.type) ? r.transit_days : r.make_buy === 'MAKE' ? r.lead_time_days : (r.sup_lt ?? r.lead_time_days));
  return m;
}

/** Import monthly history (e.g. 24 months exported from the old ERP). Re-importing a month replaces it. */
export async function importHistory(org: number, rows: { item_code: string; location_code: string; period: string; qty: number }[]) {
  const items = new Map((await query(`SELECT id, code FROM items WHERE org_id=$1`, [org])).map(r => [r.code, r.id]));
  const locs = new Map((await query(`SELECT id, code FROM locations WHERE org_id=$1`, [org])).map(r => [r.code, r.id]));
  const bad = rows.filter(r => !items.has(r.item_code) || !locs.has(r.location_code));
  if (bad.length) throw new HttpError(422, `Unknown item/location: ${[...new Set(bad.map(b => `${b.item_code}@${b.location_code}`))].slice(0, 5).join(', ')}`);
  const cur = monthStart(today());
  if (rows.some(r => monthStart(r.period.length === 7 ? r.period + '-01' : r.period) >= cur)) throw new HttpError(422, 'History can only be imported for completed months — the current month is built from dispatches');
  await tx(async c => {
    for (const r of rows) await c.query(`INSERT INTO demand_history VALUES ($1,$2,$3,$4) ON CONFLICT (item_id, location_id, period) DO UPDATE SET qty=EXCLUDED.qty`,
      [items.get(r.item_code), locs.get(r.location_code), r.period.length === 7 ? r.period + '-01' : r.period, r.qty]);
  });
  return { imported: rows.length };
}

/** Called inside the dispatch transaction: shipped sales quantity becomes demand history of the ship-from location */
export const recordDemand = (c: PoolClient, item: number, loc: number, qty: number, d: string) =>
  c.query(`INSERT INTO demand_history VALUES ($1,$2,$3,$4) ON CONFLICT (item_id, location_id, period) DO UPDATE SET qty = demand_history.qty + EXCLUDED.qty`, [item, loc, monthStart(d), qty]);

/**
 * Forecast run: for every finished/traded stocking point pick the best model, write 6 months of forecast
 * (keeping planner overrides), then recalculate safety stock, reorder point, ABC (value) and XYZ (variability).
 */
export async function runForecast(org: number) {
  const cur = monthStart(today());
  const sl = await query(`SELECT il.item_id, il.location_id, il.fixed_ss, il.safety_stock, i.service_level, i.avg_cost, i.std_cost
                            FROM item_locations il JOIN items i ON i.id=il.item_id WHERE i.org_id=$1 AND i.type IN ('FINISHED','TRADED') AND i.active`, [org]);
  const hist = await query(`SELECT h.item_id, h.location_id, h.period, h.qty FROM demand_history h JOIN items i ON i.id=h.item_id
                             WHERE i.org_id=$1 AND h.period < $2 ORDER BY h.period`, [org, cur]);
  const first = hist.length ? hist[0].period : cur;
  const months: string[] = []; for (let p = first; p < cur; p = addMonth(p, 1)) months.push(p);
  const series = new Map<string, number[]>();
  for (const r of sl) series.set(`${r.item_id}:${r.location_id}`, months.map(() => 0));
  for (const h of hist) { const s = series.get(`${h.item_id}:${h.location_id}`); if (s) s[months.indexOf(h.period)] = Number(h.qty); }
  const lt = await leadTimes(org);
  // ABC on the last 12 months of demand value across the network
  const itemValue = new Map<number, number>();
  for (const r of sl) { const s = series.get(`${r.item_id}:${r.location_id}`)!; itemValue.set(r.item_id, (itemValue.get(r.item_id) ?? 0) + s.slice(-12).reduce((a, b) => a + b, 0) * Number(r.std_cost)); }
  const ranked = [...itemValue.entries()].sort((a, b) => b[1] - a[1]); const tot = ranked.reduce((a, [, v]) => a + v, 0) || 1;
  const abc = new Map<number, string>(); let cum = 0; for (const [i, v] of ranked) { cum += v; abc.set(i, cum / tot <= 0.8 || abc.size === 0 ? 'A' : cum / tot <= 0.95 ? 'B' : 'C'); }
  const forecastRows: { item_id: number; location_id: number; period: string; system_qty: number; method: string; mape: number | null }[] = [];
  const locationUpdates: { item_id: number; location_id: number; safety_stock: number; reorder_point: number; avg_daily_demand: number; abc: string; xyz: string }[] = [];
  let n = 0;

  for (const r of sl) {
    const key = `${r.item_id}:${r.location_id}`, s = series.get(key) || [];
    // trim leading zeros (item launched later) so models are not biased low
    const startIdx = s.findIndex(v => v > 0); const h = startIdx < 0 ? [] : s.slice(startIdx);
    const f = forecast(h, HORIZON);
    for (let k = 0; k < HORIZON; k++) {
      forecastRows.push({
        item_id: r.item_id,
        location_id: r.location_id,
        period: addMonth(cur, k),
        system_qty: Math.round(f.forecast[k] || 0),
        method: f.method,
        mape: f.mape != null ? f.mape : null,
      });
    }
    const last12 = h.slice(-12), m12 = last12.reduce((a, b) => a + b, 0) / (last12.length || 1);
    const cv = m12 ? Math.sqrt(last12.reduce((a, b) => a + (b - m12) ** 2, 0) / (last12.length || 1)) / m12 : 1;
    const daily = (f.forecast.slice(0, 3).reduce((a, b) => a + b, 0) || 0) / 90;
    const leadDays = lt.get(key) ?? 7;
    const ss = r.fixed_ss ? Number(r.safety_stock) : Math.round(safetyStock(Number(r.service_level || 95), f.rmse || 0, leadDays + REVIEW_DAYS));

    locationUpdates.push({
      item_id: r.item_id,
      location_id: r.location_id,
      safety_stock: ss,
      reorder_point: Math.round(daily * leadDays + ss),
      avg_daily_demand: daily,
      abc: abc.get(r.item_id) ?? 'C',
      xyz: cv < 0.25 ? 'X' : cv < 0.5 ? 'Y' : 'Z',
    });
    n++;
  }

  await tx(async c => {
    // 1. Batch upsert forecasts in 1 single network query
    if (forecastRows.length > 0) {
      await c.query(`
        INSERT INTO forecasts(item_id, location_id, period, system_qty, method, mape)
        SELECT * FROM UNNEST($1::int[], $2::int[], $3::date[], $4::int[], $5::text[], $6::numeric[])
        ON CONFLICT (item_id, location_id, period)
        DO UPDATE SET system_qty=EXCLUDED.system_qty, method=EXCLUDED.method, mape=EXCLUDED.mape
      `, [
        forecastRows.map(r => r.item_id),
        forecastRows.map(r => r.location_id),
        forecastRows.map(r => r.period),
        forecastRows.map(r => r.system_qty),
        forecastRows.map(r => r.method),
        forecastRows.map(r => r.mape),
      ]);
    }

    // 2. Batch update item_locations in 1 single network query
    if (locationUpdates.length > 0) {
      await c.query(`
        UPDATE item_locations AS il SET
          safety_stock = u.safety_stock,
          reorder_point = u.reorder_point,
          avg_daily_demand = u.avg_daily_demand,
          abc = u.abc,
          xyz = u.xyz
        FROM (
          SELECT * FROM UNNEST(
            $1::int[], $2::int[], $3::numeric[], $4::numeric[], $5::numeric[], $6::text[], $7::text[]
          ) AS t(item_id, location_id, safety_stock, reorder_point, avg_daily_demand, abc, xyz)
        ) AS u
        WHERE il.item_id = u.item_id AND il.location_id = u.location_id
      `, [
        locationUpdates.map(r => r.item_id),
        locationUpdates.map(r => r.location_id),
        locationUpdates.map(r => r.safety_stock),
        locationUpdates.map(r => r.reorder_point),
        locationUpdates.map(r => r.avg_daily_demand),
        locationUpdates.map(r => r.abc),
        locationUpdates.map(r => r.xyz),
      ]);
    }
  });
  return { forecasted: n, months: HORIZON, from: cur };
}

export async function setOverride(org: number, uid: number, d: { item_id: number; location_id: number; period: string; qty: number | null; note: string | null }) {
  if (d.period < monthStart(today())) throw new HttpError(422, 'Past months cannot be overridden');
  const r = await one(`UPDATE forecasts f SET override_qty=$4, override_note=$5, override_by=$6 FROM items i
                        WHERE f.item_id=i.id AND i.org_id=$1 AND f.item_id=$2 AND f.location_id=$3 AND f.period=$7 RETURNING f.*`,
    [org, d.item_id, d.location_id, d.qty, d.qty == null ? null : d.note, uid, monthStart(d.period)]);
  if (!r) throw new HttpError(404, 'No forecast for that month — run the forecast first');
  return r;
}

/** Forecast workbench: one row per item × location with history, forecast and policy */
export async function forecastTable(org: number, locationId?: number) {
  const cur = monthStart(today());
  const rows = await query(`SELECT il.*, i.code, i.name, i.uom, i.service_level, l.code AS location_code, l.name AS location_name,
        (SELECT json_agg(json_build_object('period', f.period, 'system', f.system_qty, 'override', f.override_qty, 'note', f.override_note) ORDER BY f.period)
           FROM forecasts f WHERE f.item_id=il.item_id AND f.location_id=il.location_id AND f.period >= $2) AS fc,
        (SELECT method FROM forecasts f WHERE f.item_id=il.item_id AND f.location_id=il.location_id AND f.period=$2) AS method,
        (SELECT mape FROM forecasts f WHERE f.item_id=il.item_id AND f.location_id=il.location_id AND f.period=$2) AS mape,
        (SELECT json_agg(json_build_object('period', h.period, 'qty', h.qty) ORDER BY h.period) FROM demand_history h
           WHERE h.item_id=il.item_id AND h.location_id=il.location_id AND h.period >= ($2::date - interval '12 months')) AS hist,
        COALESCE(s.on_hand,0) AS on_hand
      FROM item_locations il JOIN items i ON i.id=il.item_id JOIN locations l ON l.id=il.location_id LEFT JOIN stock s ON s.item_id=il.item_id AND s.location_id=il.location_id
     WHERE i.org_id=$1 AND i.type IN ('FINISHED','TRADED') AND ($3::int IS NULL OR il.location_id=$3) ORDER BY l.code, i.code`, [org, cur, locationId ?? null]);
  return { current: cur, rows };
}

/** One item × location: full history, back-test fit and forecast for the chart */
export async function demandDetail(org: number, itemId: number, locationId: number) {
  const cur = monthStart(today());
  const il = await one(`SELECT il.*, i.code, i.name, i.service_level, l.code AS location_code FROM item_locations il JOIN items i ON i.id=il.item_id JOIN locations l ON l.id=il.location_id
                         WHERE i.org_id=$1 AND il.item_id=$2 AND il.location_id=$3`, [org, itemId, locationId]);
  if (!il) throw new HttpError(404, 'Not a stocking point');
  const hist = await query(`SELECT period, qty FROM demand_history WHERE item_id=$1 AND location_id=$2 ORDER BY period`, [itemId, locationId]);
  const fc = await query(`SELECT * FROM forecasts WHERE item_id=$1 AND location_id=$2 AND period >= $3 ORDER BY period`, [itemId, locationId, cur]);
  const past = hist.filter(h => h.period < cur), h = past.map(x => Number(x.qty)); const st = h.findIndex(v => v > 0);
  const f = forecast(st < 0 ? [] : h.slice(st), HORIZON);
  const fitted = [...Array(Math.max(0, st)).fill(null), ...f.fitted];
  return { ...il, history: hist.map((x, i) => ({ ...x, fitted: x.period < cur ? fitted[i] ?? null : null })), forecast: fc, model: { method: f.method, mape: f.mape, rmse: Math.round(f.rmse * 10) / 10 } };
}
