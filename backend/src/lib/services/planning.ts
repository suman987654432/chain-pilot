import { one, query, tx } from '../db';
import { HttpError, Session } from '../auth';
import { lotSize } from '../forecast';
import { addDays, today } from '../dates';
import { addMonth, monthStart } from './demand';

const WEEKS = 12;
const COMPONENT_SS_DAYS = 7;   // components: safety stock = 1 week of average dependent requirement (unless fixed)
const mondayOf = (d: string) => { const x = new Date(d + 'T00:00:00Z'); const wd = (x.getUTCDay() + 6) % 7; return addDays(d, -wd); };
const daysIn = (p: string) => new Date(Date.UTC(+p.slice(0, 4), +p.slice(5, 7), 0)).getUTCDate();

type Bucket = { gross: number; dep: number; sched: number; planned: number; release: number; projected: number };
type Node = { item: any; loc: any; key: string; source: 'BUY' | 'MAKE' | 'TRANSFER'; lead: number; moq: number; mult: number; supplier: number | null;
  onHand: number; ss: number; fixedSs: boolean; b: Bucket[]; exceptions: Set<string> };

/**
 * Multi-echelon MRP / DRP in weekly buckets.
 * Order of netting: low-level code (finished goods → components), and inside an item the network from the
 * outermost depot back to the plant, so a child's planned transfers become dependent demand of its parent,
 * and a planned production order explodes its bill of materials into component demand in the release week.
 *   gross = max(forecast, sales orders) + dependent demand          (forecast consumption)
 *   projected = previous + scheduled receipts + planned receipts − gross
 *   if projected < safety stock → planned order (MOQ / multiple), released lead time earlier
 */
export async function runPlan(org: number, uid: number) {
  const t = today(), start = mondayOf(t);
  const bucketOf = (d: string) => Math.max(0, Math.floor((Date.parse(d) - Date.parse(start)) / 7 / 86400e3));
  const end = addDays(start, WEEKS * 7);

  const [locs, items, ils, stock, bom, src] = await Promise.all([
    query(`SELECT * FROM locations WHERE org_id=$1 AND active`, [org]),
    query(`SELECT * FROM items WHERE org_id=$1 AND active`, [org]),
    query(`SELECT il.* FROM item_locations il JOIN items i ON i.id=il.item_id WHERE i.org_id=$1`, [org]),
    query(`SELECT s.* FROM stock s JOIN items i ON i.id=s.item_id WHERE i.org_id=$1`, [org]),
    query(`SELECT b.* FROM bom_lines b JOIN items i ON i.id=b.parent_id WHERE i.org_id=$1`, [org]),
    query(`SELECT si.* FROM supplier_items si JOIN suppliers s ON s.id=si.supplier_id WHERE s.org_id=$1 AND si.preferred AND s.status <> 'BLOCKED'`, [org]),
  ]);
  const L = new Map(locs.map(l => [l.id, l])), I = new Map(items.map(i => [i.id, i]));
  const depth = (id: number): number => { const l = L.get(id); return l?.supply_from ? 1 + depth(l.supply_from) : 0; };
  // low-level code: deepest position of an item in any bill of materials
  const llc = new Map<number, number>(); const setLlc = (id: number, lv: number) => { if ((llc.get(id) ?? -1) >= lv) return; llc.set(id, lv); bom.filter(b => b.parent_id === id).forEach(b => setLlc(b.component_id, lv + 1)); };
  items.forEach(i => setLlc(i.id, 0));

  const nodes = new Map<string, Node>();
  const blank = () => Array.from({ length: WEEKS }, () => ({ gross: 0, dep: 0, sched: 0, planned: 0, release: 0, projected: 0 }));
  for (const il of ils) {
    const item = I.get(il.item_id), loc = L.get(il.location_id); if (!item || !loc) continue;
    const s = src.find(x => x.item_id === item.id);
    const transfer = !!loc.supply_from && ['FINISHED', 'TRADED'].includes(item.type);
    const source = transfer ? 'TRANSFER' : item.make_buy === 'MAKE' ? 'MAKE' : 'BUY';
    const n: Node = { item, loc, key: `${item.id}:${loc.id}`, source,
      lead: source === 'TRANSFER' ? loc.transit_days : source === 'BUY' && s ? s.lead_time_days : item.lead_time_days,
      moq: source === 'TRANSFER' ? Number(item.lot_multiple) : Math.max(Number(item.moq), s ? Number(s.moq) : 0), mult: Number(item.lot_multiple),
      supplier: source === 'BUY' ? s?.supplier_id ?? null : null, onHand: Number(stock.find(x => x.item_id === item.id && x.location_id === loc.id)?.on_hand ?? 0),
      ss: Number(il.safety_stock), fixedSs: il.fixed_ss, b: blank(), exceptions: new Set() };
    if (source === 'BUY' && !s) n.exceptions.add('NO_SOURCE');
    nodes.set(n.key, n);
  }
  const node = (item: number, loc: number) => nodes.get(`${item}:${loc}`);

  // ---- independent demand: forecast (consumed by month-to-date actuals) vs open sales orders ----
  const cur = monthStart(t);
  const fc = await query(`SELECT f.item_id, f.location_id, f.period, COALESCE(f.override_qty, f.system_qty) AS qty FROM forecasts f JOIN items i ON i.id=f.item_id
                           WHERE i.org_id=$1 AND f.period >= $2 AND f.period < $3`, [org, cur, addMonth(monthStart(end), 1)]);
  const mtd = new Map((await query(`SELECT h.item_id, h.location_id, h.qty FROM demand_history h JOIN items i ON i.id=h.item_id WHERE i.org_id=$1 AND h.period=$2`, [org, cur]))
    .map(r => [`${r.item_id}:${r.location_id}`, Number(r.qty)]));
  const fcWeek = new Map<string, number[]>();
  for (const f of fc) {
    const key = `${f.item_id}:${f.location_id}`; if (!nodes.has(key)) continue;
    const arr = fcWeek.get(key) ?? Array(WEEKS).fill(0); fcWeek.set(key, arr);
    const days = daysIn(f.period); let firstDay = f.period, qty = Number(f.qty);
    if (f.period === cur) { firstDay = t; qty = Math.max(0, qty - (mtd.get(key) ?? 0)); }      // what is left of this month's forecast
    const remaining = days - (Date.parse(firstDay) - Date.parse(f.period)) / 86400e3, rate = qty / remaining;
    for (let d = firstDay; d < addMonth(f.period, 1) && d < end; d = addDays(d, 1)) if (d >= start) arr[bucketOf(d)] += rate;
  }
  const soWeek = new Map<string, number[]>();
  for (const r of await query(`SELECT l.item_id, so.location_id, so.promised_date, l.qty - l.shipped_qty AS open FROM so_lines l JOIN sales_orders so ON so.id=l.so_id
                                WHERE so.org_id=$1 AND so.status IN ('OPEN','ALLOCATED','PARTIAL') AND l.qty > l.shipped_qty`, [org])) {
    const key = `${r.item_id}:${r.location_id}`; if (!nodes.has(key) || r.promised_date >= end) continue;
    const arr = soWeek.get(key) ?? Array(WEEKS).fill(0); soWeek.set(key, arr); arr[bucketOf(r.promised_date)] += Number(r.open);
  }
  for (const n of nodes.values()) { const f = fcWeek.get(n.key), so = soWeek.get(n.key); n.b.forEach((b, w) => (b.gross = Math.max(f?.[w] ?? 0, so?.[w] ?? 0))); }

  // ---- scheduled receipts & firm demand from existing documents ----
  const late = new Set<string>();
  const sched = (item: number, loc: number, d: string, q: number) => { const n = node(item, loc); if (!n || q <= 0 || d >= end) return; if (d < t) late.add(n.key); n.b[bucketOf(d)].sched += q; };
  const firmDemand = (item: number, loc: number, d: string, q: number) => { const n = node(item, loc); if (!n || q <= 0 || d >= end) return; n.b[bucketOf(d)].dep += q; };
  for (const r of await query(`SELECT pl.item_id, po.location_id, po.expected_date, pl.qty - pl.accepted_qty AS open FROM po_lines pl JOIN purchase_orders po ON po.id=pl.po_id
                                WHERE po.org_id=$1 AND po.status IN ('DRAFT','PENDING_APPROVAL','APPROVED','PARTIAL')`, [org])) sched(r.item_id, r.location_id, r.expected_date, Number(r.open));
  for (const r of await query(`SELECT l.item_id, pr.location_id, pr.need_date, l.qty FROM pr_lines l JOIN purchase_requisitions pr ON pr.id=l.pr_id
                                WHERE pr.org_id=$1 AND pr.status IN ('DRAFT','SUBMITTED','APPROVED','RFQ')`, [org])) sched(r.item_id, r.location_id, r.need_date, Number(r.qty));
  for (const r of await query(`SELECT item_id, location_id, due_date, qty - completed_qty AS open FROM production_orders WHERE org_id=$1 AND status IN ('PLANNED','RELEASED')`, [org])) {
    sched(r.item_id, r.location_id, r.due_date, Number(r.open));
    for (const b of bom.filter(x => x.parent_id === r.item_id)) firmDemand(b.component_id, r.location_id, r.due_date < t ? t : addDays(r.due_date, -I.get(r.item_id).lead_time_days), Number(r.open) * Number(b.qty_per) * (1 + Number(b.scrap_pct) / 100));
  }
  for (const r of await query(`SELECT t.status, t.from_location_id, t.to_location_id, t.need_date, l.item_id, l.qty, l.shipped_qty, l.received_qty
                                FROM to_lines l JOIN transfer_orders t ON t.id=l.to_id WHERE t.org_id=$1 AND t.status IN ('DRAFT','RELEASED','DISPATCHED')`, [org])) {
    if (r.status === 'DISPATCHED') sched(r.item_id, r.to_location_id, r.need_date < t ? t : r.need_date, Number(r.shipped_qty) - Number(r.received_qty));
    else { sched(r.item_id, r.to_location_id, r.need_date, Number(r.qty) - Number(r.shipped_qty));
      firmDemand(r.item_id, r.from_location_id, addDays(r.need_date, -L.get(r.to_location_id).transit_days), Number(r.qty) - Number(r.shipped_qty)); }
  }

  // ---- net in low-level-code / network order ----
  const order = [...nodes.values()].sort((a, b) => (llc.get(a.item.id)! - llc.get(b.item.id)!) || (depth(b.loc.id) - depth(a.loc.id)));
  const planned: any[] = [];
  for (const n of order) {
    const lt = Math.ceil(n.lead / 7), gross = n.b.map(b => b.gross + b.dep);
    const avgWeek = gross.reduce((a, b) => a + b, 0) / WEEKS;
    if (n.item.type !== 'FINISHED' && n.item.type !== 'TRADED' && !n.fixedSs) n.ss = Math.round(avgWeek * COMPONENT_SS_DAYS / 7);
    let proj = n.onHand, noPlan = n.onHand;
    if (n.onHand < n.ss && gross.some(g => g > 0)) n.exceptions.add(n.onHand <= 0 ? 'STOCKOUT' : 'BELOW_SS');
    if (late.has(n.key)) n.exceptions.add('LATE_SUPPLY');
    for (let w = 0; w < WEEKS; w++) {
      const b = n.b[w];
      noPlan += b.sched - gross[w]; if (noPlan < 0 && w < Math.max(lt, 1)) n.exceptions.add('STOCKOUT_RISK');
      proj += b.sched - gross[w];
      if (proj < n.ss - 1e-6) {
        const q = lotSize(n.ss - proj, n.moq, n.mult); b.planned += q; proj += q;
        const needDate = w === 0 ? t : addDays(start, w * 7); let rel = addDays(needDate, -n.lead); const pastDue = rel < t; if (pastDue) { rel = t; n.exceptions.add('EXPEDITE'); }
        n.b[bucketOf(rel)].release += q;
        planned.push({ kind: n.source, item_id: n.item.id, location_id: n.loc.id, source_location_id: n.source === 'TRANSFER' ? n.loc.supply_from : null,
          supplier_id: n.supplier, qty: q, release_date: rel, need_date: needDate, past_due: pastDue });
        // dependent demand: transfers pull from the parent location, production explodes the BOM at release
        if (n.source === 'TRANSFER') { const p = node(n.item.id, n.loc.supply_from); if (p) p.b[bucketOf(rel)].dep += q; }
        if (n.source === 'MAKE') for (const bl of bom.filter(x => x.parent_id === n.item.id)) { const c = node(bl.component_id, n.loc.id); if (c) c.b[bucketOf(rel)].dep += q * Number(bl.qty_per) * (1 + Number(bl.scrap_pct) / 100); }
      }
      b.projected = proj;
    }
    if (avgWeek > 0 && n.onHand > n.ss + 8 * avgWeek) n.exceptions.add('EXCESS');
    if (avgWeek === 0 && n.onHand > 0 && ['FINISHED', 'TRADED'].includes(n.item.type)) n.exceptions.add('NO_DEMAND');
  }

  return tx(async c => {
    await c.query(`UPDATE planned_orders SET status='DISMISSED', converted_ref='superseded' WHERE org_id=$1 AND status='OPEN'`, [org]);
    const summary = { planned_orders: planned.length, buy: planned.filter(p => p.kind === 'BUY').length, make: planned.filter(p => p.kind === 'MAKE').length,
      transfer: planned.filter(p => p.kind === 'TRANSFER').length, past_due: planned.filter(p => p.past_due).length,
      exceptions: [...nodes.values()].reduce((a, n) => a + n.exceptions.size, 0) };
    const { rows: [run] } = await c.query(`INSERT INTO plan_runs(org_id, run_by, start_week, weeks, summary) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [org, uid, start, WEEKS, summary]);
    for (const n of nodes.values()) {
      const avgDaily = n.b.reduce((a, b) => a + b.gross + b.dep, 0) / (WEEKS * 7);
      const rop = Math.round(avgDaily * n.lead + n.ss);
      if (!['FINISHED', 'TRADED'].includes(n.item.type)) await c.query(`UPDATE item_locations SET safety_stock=$3, reorder_point=$4, avg_daily_demand=$5 WHERE item_id=$1 AND location_id=$2`, [n.item.id, n.loc.id, n.ss, rop, avgDaily]);
      const grid = n.b.map((b, w) => ({ week: addDays(start, w * 7), gross: Math.round(b.gross), dependent: Math.round(b.dep), scheduled: Math.round(b.sched), planned: Math.round(b.planned), release: Math.round(b.release), projected: Math.round(b.projected) }));
      await c.query(`INSERT INTO plan_items VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [run.id, n.item.id, n.loc.id, n.source, n.onHand, n.ss, rop, JSON.stringify(grid), [...n.exceptions]]);
    }
    for (const p of planned)
      await c.query(`INSERT INTO planned_orders(org_id, run_id, kind, item_id, location_id, source_location_id, supplier_id, qty, release_date, need_date, past_due)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [org, run.id, p.kind, p.item_id, p.location_id, p.source_location_id, p.supplier_id, p.qty, p.release_date, p.need_date, p.past_due]);
    return { run_id: run.id, start_week: start, weeks: WEEKS, ...summary };
  });
}

export async function latestPlan(org: number) {
  const run = await one(`SELECT r.*, u.name AS run_by_name FROM plan_runs r LEFT JOIN users u ON u.id=r.run_by WHERE r.org_id=$1 ORDER BY r.id DESC LIMIT 1`, [org]);
  if (!run) return { run: null, items: [], orders: [] };
  const items = await query(`SELECT p.item_id, p.location_id, p.source, p.on_hand, p.safety_stock, p.reorder_point, p.exceptions, i.code, i.name, i.type, i.uom, l.code AS location_code,
                                    (SELECT SUM((g->>'gross')::numeric + (g->>'dependent')::numeric) FROM jsonb_array_elements(p.grid) g) AS total_req,
                                    (SELECT MIN((g->>'projected')::numeric) FROM jsonb_array_elements(p.grid) g) AS min_projected
                               FROM plan_items p JOIN items i ON i.id=p.item_id JOIN locations l ON l.id=p.location_id WHERE p.run_id=$1
                              ORDER BY cardinality(p.exceptions) DESC, i.type, i.code, l.code`, [run.id]);
  const orders = await query(`SELECT po.*, i.code AS item_code, i.name AS item_name, i.uom, l.code AS location_code, sl.code AS source_code, s.name AS supplier,
                                     COALESCE(si.price, i.std_cost) * po.qty AS value
                                FROM planned_orders po JOIN items i ON i.id=po.item_id JOIN locations l ON l.id=po.location_id
                                LEFT JOIN locations sl ON sl.id=po.source_location_id LEFT JOIN suppliers s ON s.id=po.supplier_id
                                LEFT JOIN supplier_items si ON si.supplier_id=po.supplier_id AND si.item_id=po.item_id
                               WHERE po.run_id=$1 ORDER BY po.release_date, po.kind, i.code`, [run.id]);
  return { run, items, orders };
}
export async function planGrid(org: number, itemId: number, locationId: number) {
  const r = await one(`SELECT p.*, i.code, i.name, i.uom, l.code AS location_code, r.start_week FROM plan_items p JOIN plan_runs r ON r.id=p.run_id
                        JOIN items i ON i.id=p.item_id JOIN locations l ON l.id=p.location_id
                       WHERE r.org_id=$1 AND p.item_id=$2 AND p.location_id=$3 ORDER BY r.id DESC LIMIT 1`, [org, itemId, locationId]);
  if (!r) throw new HttpError(404, 'Not planned yet');
  return r;
}

/** Firm planned orders into documents: BUY → purchase requisition (per location), TRANSFER → transfer order (per lane), MAKE → production order */
export async function convertPlanned(s: Session, ids: number[]) {
  return tx(async c => {
    const { rows } = await c.query(`SELECT po.*, COALESCE(si.price, i.std_cost) AS price FROM planned_orders po JOIN items i ON i.id=po.item_id
                                     LEFT JOIN supplier_items si ON si.supplier_id=po.supplier_id AND si.item_id=po.item_id
                                    WHERE po.org_id=$1 AND po.id = ANY($2) FOR UPDATE OF po`, [s.orgId, ids]);
    if (rows.length !== ids.length) throw new HttpError(404, 'Some planned orders were not found');
    const done = rows.filter(r => r.status !== 'OPEN'); if (done.length) throw new HttpError(422, `${done.length} planned order(s) are no longer open — re-run planning`);
    const out: string[] = [];
    const group = (k: (r: any) => string) => rows.reduce((m, r) => m.set(k(r), [...(m.get(k(r)) ?? []), r]), new Map<string, any[]>());
    for (const [, g] of group(r => r.kind === 'BUY' ? `B${r.location_id}` : r.kind === 'TRANSFER' ? `T${r.source_location_id}-${r.location_id}` : `M${r.id}`)) {
      const f = g[0], need = g.map((x: any) => x.need_date).sort()[0]; let ref: string;
      if (f.kind === 'BUY') {
        const { rows: [pr] } = await c.query(`INSERT INTO purchase_requisitions(org_id, pr_no, location_id, need_date, status, source, requested_by, remarks)
                                               VALUES ($1, next_no($1,'PR'), $2, $3, 'SUBMITTED', 'PLANNING', $4, 'From MRP run') RETURNING *`, [s.orgId, f.location_id, need, s.uid]);
        for (const r of g) await c.query(`INSERT INTO pr_lines(pr_id, item_id, qty, est_price, planned_order_id) VALUES ($1,$2,$3,$4,$5)`, [pr.id, r.item_id, r.qty, r.price, r.id]);
        ref = pr.pr_no;
      } else if (f.kind === 'TRANSFER') {
        const { rows: [to] } = await c.query(`INSERT INTO transfer_orders(org_id, to_no, from_location_id, to_location_id, need_date, created_by, planned_order_id)
                                               VALUES ($1, next_no($1,'TO'), $2, $3, $4, $5, $6) RETURNING *`, [s.orgId, f.source_location_id, f.location_id, need, s.uid, f.id]);
        for (const r of g) await c.query(`INSERT INTO to_lines(to_id, item_id, qty) VALUES ($1,$2,$3)`, [to.id, r.item_id, r.qty]);
        ref = to.to_no;
      } else {
        const { rows: [mo] } = await c.query(`INSERT INTO production_orders(org_id, mo_no, item_id, location_id, qty, due_date, planned_order_id, created_by)
                                               VALUES ($1, next_no($1,'MO'), $2, $3, $4, $5, $6, $7) RETURNING *`, [s.orgId, f.item_id, f.location_id, f.qty, f.need_date, f.id, s.uid]);
        ref = mo.mo_no;
      }
      await c.query(`UPDATE planned_orders SET status='CONVERTED', converted_ref=$2 WHERE id = ANY($1)`, [g.map((x: any) => x.id), ref]);
      out.push(ref);
    }
    return { created: out };
  });
}
export async function dismissPlanned(org: number, ids: number[]) {
  const r = await query(`UPDATE planned_orders SET status='DISMISSED' WHERE org_id=$1 AND id=ANY($2) AND status='OPEN' RETURNING id`, [org, ids]);
  return { dismissed: r.length };
}
