import { one, query } from '../db';
import { today } from '../dates';
import { monthStart } from './demand';

/** Control tower: network inventory, service, supply and planning signals in one call */
export async function controlTower(org: number) {
  const t = today();
  const [inv, health, transit, otif, fill, supp, procure, logistics, planning, fa, cogs, risk, trend, org_] = await Promise.all([
    query(`SELECT l.id, l.code, l.name, l.type, COALESCE(SUM(s.on_hand * i.avg_cost),0) AS value, COALESCE(SUM(s.on_hand) FILTER (WHERE i.type IN ('FINISHED','TRADED')),0) AS fg_units
             FROM locations l LEFT JOIN stock s ON s.location_id=l.id LEFT JOIN items i ON i.id=s.item_id WHERE l.org_id=$1 GROUP BY l.id ORDER BY l.id`, [org]),
    query(`SELECT l.code, h.health, COUNT(*) AS n FROM (
             SELECT il.location_id, CASE WHEN COALESCE(s.on_hand,0) <= 0 AND il.avg_daily_demand > 0 THEN 'STOCKOUT' WHEN COALESCE(s.on_hand,0) < il.safety_stock THEN 'BELOW_SS'
                    WHEN COALESCE(s.on_hand,0) < il.reorder_point THEN 'REORDER' WHEN il.avg_daily_demand > 0 AND COALESCE(s.on_hand,0) > il.reorder_point + 60*il.avg_daily_demand THEN 'EXCESS' ELSE 'HEALTHY' END AS health
               FROM item_locations il JOIN items i ON i.id=il.item_id LEFT JOIN stock s ON s.item_id=il.item_id AND s.location_id=il.location_id WHERE i.org_id=$1) h
             JOIN locations l ON l.id=h.location_id GROUP BY l.code, h.health`, [org]),
    one(`SELECT COALESCE(SUM(t.qty * i.avg_cost),0) AS value, COUNT(DISTINCT t.to_id) AS transfers FROM v_in_transit t JOIN items i ON i.id=t.item_id WHERE t.org_id=$1`, [org]),
    // customer OTIF: delivered stops in the last 30 days that were complete and on or before the promised date
    one(`SELECT COUNT(*) AS stops, COUNT(*) FILTER (WHERE st.status='DELIVERED' AND st.delivered_at::date <= so.promised_date) AS otif,
                COUNT(*) FILTER (WHERE st.delivered_at::date <= so.promised_date) AS on_time, COUNT(*) FILTER (WHERE st.status='DELIVERED') AS in_full
           FROM shipment_stops st JOIN shipments sh ON sh.id=st.shipment_id JOIN sales_orders so ON so.id=st.so_id
          WHERE sh.org_id=$1 AND st.status IN ('DELIVERED','PARTIAL') AND st.delivered_at >= now() - interval '30 days'`, [org]),
    // fill rate: shipped quantity ÷ ordered quantity for orders promised in the last 30 days
    one(`SELECT COALESCE(SUM(l.qty),0) AS ordered, COALESCE(SUM(l.shipped_qty),0) AS shipped FROM so_lines l JOIN sales_orders so ON so.id=l.so_id
          WHERE so.org_id=$1 AND so.status <> 'CANCELLED' AND so.promised_date BETWEEN $2::date - 30 AND $2::date`, [org, t]),
    query(`SELECT * FROM v_supplier_performance WHERE org_id=$1 ORDER BY name`, [org]),
    one(`SELECT COUNT(*) FILTER (WHERE status='PENDING_APPROVAL') AS pending_approval, COALESCE(SUM(total) FILTER (WHERE status='PENDING_APPROVAL'),0) AS pending_value,
                COUNT(*) FILTER (WHERE status IN ('APPROVED','PARTIAL')) AS open_pos, COALESCE(SUM(total) FILTER (WHERE status IN ('APPROVED','PARTIAL')),0) AS open_value,
                COUNT(*) FILTER (WHERE status IN ('APPROVED','PARTIAL') AND expected_date < $2) AS late_pos,
                (SELECT COUNT(*) FROM purchase_requisitions WHERE org_id=$1 AND status='SUBMITTED') AS prs_to_approve,
                (SELECT COUNT(*) FROM rfqs WHERE org_id=$1 AND status='OPEN') AS open_rfqs
           FROM purchase_orders WHERE org_id=$1`, [org, t]),
    one(`SELECT COUNT(*) FILTER (WHERE status='PLANNED') AS planned, COUNT(*) FILTER (WHERE status='DISPATCHED') AS in_transit,
                COUNT(*) FILTER (WHERE status='DISPATCHED' AND type='SALES' AND dispatched_at < now() - interval '3 days') AS delayed,
                COALESCE(SUM(freight_cost) FILTER (WHERE dispatched_at >= now() - interval '30 days'),0) AS freight_30d,
                COALESCE(SUM(total_weight) FILTER (WHERE dispatched_at >= now() - interval '30 days'),0) AS kg_30d,
                (SELECT COUNT(*) FROM sales_orders WHERE org_id=$1 AND status IN ('OPEN','ALLOCATED','PARTIAL') AND promised_date < $2) AS late_orders,
                (SELECT COUNT(*) FROM sales_orders WHERE org_id=$1 AND status IN ('OPEN','ALLOCATED','PARTIAL')) AS open_orders
           FROM shipments WHERE org_id=$1`, [org, t]),
    one(`SELECT r.id, r.run_at, r.summary, (SELECT COUNT(*) FROM planned_orders WHERE run_id=r.id AND status='OPEN') AS open_planned,
                (SELECT COUNT(*) FROM planned_orders WHERE run_id=r.id AND status='OPEN' AND past_due) AS past_due,
                (SELECT json_agg(x) FROM (SELECT unnest(exceptions) AS ex, COUNT(*) AS n FROM plan_items WHERE run_id=r.id GROUP BY 1 ORDER BY 2 DESC) x) AS exceptions
           FROM plan_runs r WHERE r.org_id=$1 ORDER BY r.id DESC LIMIT 1`, [org]),
    // forecast quality: demand-weighted MAPE of the selected models (back-test) and last month bias
    one(`SELECT ROUND(SUM(f.mape * il.avg_daily_demand) / NULLIF(SUM(il.avg_daily_demand) FILTER (WHERE f.mape IS NOT NULL),0), 1) AS wmape,
                (SELECT COUNT(*) FROM forecasts f2 JOIN items i2 ON i2.id=f2.item_id WHERE i2.org_id=$1 AND f2.period >= $2 AND f2.override_qty IS NOT NULL) AS overrides
           FROM forecasts f JOIN item_locations il ON il.item_id=f.item_id AND il.location_id=f.location_id JOIN items i ON i.id=f.item_id WHERE i.org_id=$1 AND f.period=$2`, [org, monthStart(t)]),
    one(`SELECT COALESCE(-SUM(qty * unit_cost) FILTER (WHERE type='DISPATCH'),0) AS cogs_90 FROM stock_moves WHERE org_id=$1 AND move_date >= $2::date - 90`, [org, t]),
    // lowest cover vs replenishment lead time — what will stock out first
    query(`SELECT i.code, i.name, l.code AS location_code, COALESCE(s.on_hand,0) AS on_hand, il.safety_stock, il.avg_daily_demand,
                  ROUND(COALESCE(s.on_hand,0) / NULLIF(il.avg_daily_demand,0), 1) AS days_cover,
                  CASE WHEN l.supply_from IS NOT NULL THEN l.transit_days ELSE i.lead_time_days END AS lead_days
             FROM item_locations il JOIN items i ON i.id=il.item_id JOIN locations l ON l.id=il.location_id LEFT JOIN stock s ON s.item_id=il.item_id AND s.location_id=il.location_id
            WHERE i.org_id=$1 AND il.avg_daily_demand > 0 ORDER BY COALESCE(s.on_hand,0) / il.avg_daily_demand LIMIT 8`, [org]),
    query(`SELECT to_char(m, 'Mon YY') AS label, m AS period,
                  COALESCE((SELECT SUM(h.qty) FROM demand_history h JOIN items i ON i.id=h.item_id WHERE i.org_id=$1 AND h.period=m),0) AS actual,
                  (SELECT SUM(COALESCE(f.override_qty, f.system_qty)) FROM forecasts f JOIN items i ON i.id=f.item_id WHERE i.org_id=$1 AND f.period=m) AS forecast
             FROM generate_series($2::date - interval '12 months', $2::date + interval '5 months', interval '1 month') m ORDER BY m`, [org, monthStart(t)]),
    one(`SELECT name FROM organizations WHERE id=$1`, [org]),
  ]);
  const invValue = inv.reduce((a, l) => a + Number(l.value), 0) + Number(transit!.value);
  const suppliers = supp.map(s => ({ ...s, otif_pct: s.lines_due ? Math.round(1000 * s.lines_otif / s.lines_due) / 10 : null,
    quality_pct: Number(s.qty_received) ? Math.round(1000 * (1 - Number(s.qty_rejected) / Number(s.qty_received))) / 10 : null }));
  const sl = suppliers.reduce((a, s) => [a[0] + Number(s.lines_due), a[1] + Number(s.lines_otif)], [0, 0]);
  return {
    org: org_?.name, as_of: t, inventory: { value: Math.round(invValue), in_transit_value: Math.round(Number(transit!.value)), in_transit_transfers: Number(transit!.transfers), by_location: inv,
      turns: invValue ? Math.round(10 * Number(cogs!.cogs_90) * 4 / invValue) / 10 : null },
    health, otif: { ...otif, pct: Number(otif!.stops) ? Math.round(1000 * Number(otif!.otif) / Number(otif!.stops)) / 10 : null },
    fill_rate: Number(fill!.ordered) ? Math.round(1000 * Number(fill!.shipped) / Number(fill!.ordered)) / 10 : null,
    supplier_otif: sl[0] ? Math.round(1000 * sl[1] / sl[0]) / 10 : null, suppliers, procurement: procure, logistics,
    planning, forecast: { wmape: fa?.wmape ?? null, accuracy: fa?.wmape != null ? Math.round(10 * (100 - Number(fa.wmape))) / 10 : null, overrides: Number(fa?.overrides ?? 0) },
    risk, trend,
  };
}
