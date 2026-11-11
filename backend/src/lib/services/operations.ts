import { PoolClient } from 'pg';
import { one, query, tx } from '../db';
import { HttpError, Session, assertLocation } from '../auth';
import { r2 } from '../money';
import { today } from '../dates';
import { recordDemand } from './demand';

const move = (c: PoolClient, s: Session, m: { item: number; loc: number; qty: number; type: string; cost: number; refType: string; refId: number; refNo: string; date?: string; note?: string }) =>
  c.query(`INSERT INTO stock_moves(org_id,item_id,location_id,qty,type,unit_cost,ref_type,ref_id,ref_no,move_date,user_id,note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [s.orgId, m.item, m.loc, m.qty, m.type, m.cost, m.refType, m.refId, m.refNo, m.date ?? today(), s.uid, m.note ?? null]);

// ================================================================ Production
export const listMOs = (org: number, status?: string) => query(
  `SELECT m.*, i.code, i.name, i.uom, l.code AS location_code, (m.status IN ('PLANNED','RELEASED') AND m.due_date < CURRENT_DATE) AS late
     FROM production_orders m JOIN items i ON i.id=m.item_id JOIN locations l ON l.id=m.location_id
    WHERE m.org_id=$1 AND ($2::text IS NULL OR ($2='OPEN' AND m.status IN ('PLANNED','RELEASED')) OR m.status::text=$2) ORDER BY m.due_date, m.id LIMIT 300`, [org, status ?? null]);
export async function getMO(org: number, id: number) {
  const m = await one(`SELECT m.*, i.code, i.name, i.uom, l.code AS location_code FROM production_orders m JOIN items i ON i.id=m.item_id JOIN locations l ON l.id=m.location_id WHERE m.org_id=$1 AND m.id=$2`, [org, id]);
  if (!m) throw new HttpError(404, 'Production order not found');
  const components = await query(`SELECT b.*, i.code, i.name, i.uom, COALESCE(s.on_hand,0) - COALESCE(s.reserved,0) AS free,
                                         ROUND($3 * b.qty_per * (1 + b.scrap_pct/100), 3) AS required
                                    FROM bom_lines b JOIN items i ON i.id=b.component_id LEFT JOIN stock s ON s.item_id=b.component_id AND s.location_id=$2
                                   WHERE b.parent_id=$1 ORDER BY i.code`, [m.item_id, m.location_id, Number(m.qty) - Number(m.completed_qty)]);
  return { ...m, components };
}
export async function createMO(s: Session, d: any) {
  const it = await one(`SELECT * FROM items WHERE id=$1 AND org_id=$2`, [d.item_id, s.orgId]);
  if (!it || it.make_buy !== 'MAKE') throw new HttpError(422, 'Only make items can have production orders');
  const loc = await one(`SELECT * FROM locations WHERE id=$1 AND org_id=$2`, [d.location_id, s.orgId]);
  if (loc?.type !== 'PLANT') throw new HttpError(422, 'Production happens at a plant');
  return one(`INSERT INTO production_orders(org_id, mo_no, item_id, location_id, qty, due_date, created_by) VALUES ($1, next_no($1,'MO'), $2,$3,$4,$5,$6) RETURNING *`,
    [s.orgId, d.item_id, d.location_id, d.qty, d.due_date, s.uid]);
}
export async function releaseMO(s: Session, id: number) {
  const m = await getMO(s.orgId, id);
  if (m.status !== 'PLANNED') throw new HttpError(422, `Order is ${m.status}`);
  const short = m.components.filter((c: any) => Number(c.free) < Number(c.required));
  if (short.length) throw new HttpError(422, `Component shortage: ${short.map((c: any) => `${c.code} need ${Number(c.required)}, free ${Number(c.free)}`).join('; ')}`);
  return one(`UPDATE production_orders SET status='RELEASED' WHERE id=$1 RETURNING *`, [id]);
}
export async function cancelMO(s: Session, id: number) {
  const r = await one(`UPDATE production_orders SET status='CANCELLED' WHERE id=$1 AND org_id=$2 AND status IN ('PLANNED','RELEASED') AND completed_qty=0 RETURNING *`, [id, s.orgId]);
  if (!r) throw new HttpError(422, 'Only orders with no output reported can be cancelled');
  return r;
}
/** Report output: backflush components (BOM × qty incl. scrap) and receive the finished item at standard cost */
export async function completeMO(s: Session, id: number, qty: number) {
  return tx(async c => {
    const { rows: [m] } = await c.query(`SELECT m.*, i.std_cost FROM production_orders m JOIN items i ON i.id=m.item_id WHERE m.id=$1 AND m.org_id=$2 FOR UPDATE OF m`, [id, s.orgId]);
    if (!m) throw new HttpError(404, 'Production order not found');
    if (m.status !== 'RELEASED') throw new HttpError(422, 'Release the order before reporting output');
    assertLocation(s, m.location_id);
    if (Number(m.completed_qty) + qty > Number(m.qty)) throw new HttpError(422, `Only ${Number(m.qty) - Number(m.completed_qty)} left on this order`);
    const { rows: comps } = await c.query(`SELECT b.*, i.avg_cost FROM bom_lines b JOIN items i ON i.id=b.component_id WHERE b.parent_id=$1`, [m.item_id]);
    for (const b of comps) await move(c, s, { item: b.component_id, loc: m.location_id, qty: -r2(qty * Number(b.qty_per) * (1 + Number(b.scrap_pct) / 100)), type: 'CONSUMPTION', cost: Number(b.avg_cost), refType: 'MO', refId: m.id, refNo: m.mo_no });
    await move(c, s, { item: m.item_id, loc: m.location_id, qty, type: 'PRODUCTION_IN', cost: Number(m.std_cost), refType: 'MO', refId: m.id, refNo: m.mo_no });
    const done = Number(m.completed_qty) + qty >= Number(m.qty);
    const { rows: [r] } = await c.query(`UPDATE production_orders SET completed_qty=completed_qty+$2, status=$3::mo_status, completed_on=CASE WHEN $3::text='COMPLETED' THEN CURRENT_DATE ELSE completed_on END WHERE id=$1 RETURNING *`,
      [id, qty, done ? 'COMPLETED' : 'RELEASED']);
    return r;
  });
}

// ================================================================ Sales orders & available-to-promise
async function soStatus(c: PoolClient, soId: number) {
  const { rows: [x] } = await c.query(`SELECT bool_and(delivered_qty >= qty) AS delivered, bool_and(shipped_qty >= qty) AS shipped, bool_and(shipped_qty + allocated_qty >= qty) AS allocated,
                                              bool_or(allocated_qty > 0 OR shipped_qty > 0) AS some FROM so_lines WHERE so_id=$1`, [soId]);
  const st = x.delivered ? 'DELIVERED' : x.shipped ? 'DISPATCHED' : x.allocated ? 'ALLOCATED' : x.some ? 'PARTIAL' : 'OPEN';
  await c.query(`UPDATE sales_orders SET status=$2 WHERE id=$1 AND status <> 'CANCELLED'`, [soId, st]);
  return st;
}
/** ATP: free stock now plus confirmed incoming supply (POs, production, transfers in transit) — earliest date the quantity can be promised */
export async function atp(org: number, itemId: number, locationId: number, qty: number) {
  const st = await one(`SELECT COALESCE(on_hand,0) AS on_hand, COALESCE(reserved,0) AS reserved FROM stock WHERE item_id=$1 AND location_id=$2`, [itemId, locationId]);
  const free = Number(st?.on_hand ?? 0) - Number(st?.reserved ?? 0);
  const incoming = await query(`
    SELECT po.expected_date AS d, pl.qty - pl.accepted_qty AS q, po.po_no AS ref FROM po_lines pl JOIN purchase_orders po ON po.id=pl.po_id WHERE po.org_id=$1 AND pl.item_id=$2 AND po.location_id=$3 AND po.status IN ('APPROVED','PARTIAL')
    UNION ALL SELECT due_date, qty - completed_qty, mo_no FROM production_orders WHERE org_id=$1 AND item_id=$2 AND location_id=$3 AND status IN ('PLANNED','RELEASED')
    UNION ALL SELECT t.need_date, l.qty - l.received_qty, t.to_no FROM to_lines l JOIN transfer_orders t ON t.id=l.to_id WHERE t.org_id=$1 AND l.item_id=$2 AND t.to_location_id=$3 AND t.status IN ('RELEASED','DISPATCHED')
    ORDER BY 1`, [org, itemId, locationId]);
  let cum = free, date: string | null = free >= qty ? today() : null;
  for (const i of incoming) { if (date) break; cum += Number(i.q); if (cum >= qty) date = i.d < today() ? today() : i.d; }
  return { free, qty, can_promise_on: date, incoming };
}
export async function createSO(s: Session, d: any) {
  return tx(async c => {
    const { rows: [cu] } = await c.query(`SELECT * FROM customers WHERE id=$1 AND org_id=$2`, [d.customer_id, s.orgId]);
    if (!cu) throw new HttpError(422, 'Unknown customer');
    const loc = d.location_id ?? cu.ship_from; if (!loc) throw new HttpError(422, 'Choose the ship-from location');
    if (d.promised_date < today()) throw new HttpError(422, 'Promised date is in the past');
    let total = 0; const lines: any[] = [];
    for (const l of d.lines) {
      const { rows: [it] } = await c.query(`SELECT * FROM items WHERE id=$1 AND org_id=$2 AND type IN ('FINISHED','TRADED')`, [l.item_id, s.orgId]);
      if (!it) throw new HttpError(422, 'Only finished or traded items can be sold');
      const price = l.price ?? Number(it.sale_price); total += r2(l.qty * price * (1 + Number(it.gst_rate) / 100)); lines.push({ ...l, price, gst: it.gst_rate });
    }
    const { rows: [so] } = await c.query(`INSERT INTO sales_orders(org_id, so_no, customer_id, location_id, promised_date, priority, customer_po, total, created_by)
                                           VALUES ($1, next_no($1,'SO'), $2,$3,$4,$5,$6,$7,$8) RETURNING *`, [s.orgId, cu.id, loc, d.promised_date, d.priority, d.customer_po, r2(total), s.uid]);
    for (const l of lines) await c.query(`INSERT INTO so_lines(so_id, item_id, qty, price, gst_rate) VALUES ($1,$2,$3,$4,$5)`, [so.id, l.item_id, l.qty, l.price, l.gst]);
    return so;
  });
}
/** Reserve free stock against open order lines (oldest promise first is the caller's choice; partial allocation allowed) */
export async function allocateSO(s: Session, id: number) {
  return tx(async c => {
    const { rows: [so] } = await c.query(`SELECT * FROM sales_orders WHERE id=$1 AND org_id=$2 FOR UPDATE`, [id, s.orgId]);
    if (!so) throw new HttpError(404, 'Sales order not found');
    if (['DISPATCHED', 'DELIVERED', 'CANCELLED'].includes(so.status)) throw new HttpError(422, `Order is ${so.status}`);
    const { rows: lines } = await c.query(`SELECT l.*, i.code FROM so_lines l JOIN items i ON i.id=l.item_id WHERE so_id=$1 FOR UPDATE OF l`, [id]);
    const result: any[] = [];
    for (const l of lines) {
      const want = Number(l.qty) - Number(l.shipped_qty) - Number(l.allocated_qty); if (want <= 0) continue;
      await c.query(`INSERT INTO stock(item_id, location_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [l.item_id, so.location_id]);
      const { rows: [st] } = await c.query(`SELECT on_hand - reserved AS free FROM stock WHERE item_id=$1 AND location_id=$2 FOR UPDATE`, [l.item_id, so.location_id]);
      const a = Math.max(0, Math.min(want, Number(st.free)));
      if (a > 0) { await c.query(`UPDATE stock SET reserved=reserved+$3 WHERE item_id=$1 AND location_id=$2`, [l.item_id, so.location_id, a]);
        await c.query(`UPDATE so_lines SET allocated_qty=allocated_qty+$2 WHERE id=$1`, [l.id, a]); }
      result.push({ item: l.code, wanted: want, allocated: a, short: want - a });
    }
    return { status: await soStatus(c, id), lines: result };
  });
}
export async function cancelSO(s: Session, id: number) {
  return tx(async c => {
    const { rows: [so] } = await c.query(`SELECT * FROM sales_orders WHERE id=$1 AND org_id=$2 FOR UPDATE`, [id, s.orgId]);
    if (!so) throw new HttpError(404, 'Not found');
    const { rows: [sh] } = await c.query(`SELECT COALESCE(SUM(shipped_qty),0) AS q FROM so_lines WHERE so_id=$1`, [id]);
    if (Number(sh.q) > 0) throw new HttpError(422, 'Goods already shipped — the order cannot be cancelled');
    const { rows: [pl] } = await c.query(`SELECT 1 FROM shipment_stops st JOIN shipments sh ON sh.id=st.shipment_id WHERE st.so_id=$1 AND sh.status='PLANNED'`, [id]);
    if (pl) throw new HttpError(422, 'Remove the order from its planned shipment first');
    const { rows: lines } = await c.query(`SELECT * FROM so_lines WHERE so_id=$1 AND allocated_qty > 0`, [id]);
    for (const l of lines) await c.query(`UPDATE stock SET reserved=reserved-$3 WHERE item_id=$1 AND location_id=$2`, [l.item_id, so.location_id, l.allocated_qty]);
    await c.query(`UPDATE so_lines SET allocated_qty=0 WHERE so_id=$1`, [id]);
    return (await c.query(`UPDATE sales_orders SET status='CANCELLED' WHERE id=$1 RETURNING *`, [id])).rows[0];
  });
}
export const listSOs = (org: number, f: { status?: string; location_id?: number }) => query(
  `SELECT so.*, c.name AS customer, c.city, l.code AS location_code,
          (SELECT SUM(qty) FROM so_lines WHERE so_id=so.id) AS qty, (SELECT SUM(allocated_qty) FROM so_lines WHERE so_id=so.id) AS allocated,
          (SELECT SUM(shipped_qty) FROM so_lines WHERE so_id=so.id) AS shipped, (SELECT SUM(delivered_qty) FROM so_lines WHERE so_id=so.id) AS delivered,
          (SELECT SUM(l.allocated_qty * i.weight_kg) FROM so_lines l JOIN items i ON i.id=l.item_id WHERE l.so_id=so.id) AS alloc_weight,
          (so.status IN ('OPEN','ALLOCATED','PARTIAL') AND so.promised_date < CURRENT_DATE) AS late,
          EXISTS (SELECT 1 FROM shipment_stops st JOIN shipments sh ON sh.id=st.shipment_id WHERE st.so_id=so.id AND sh.status='PLANNED') AS planned
     FROM sales_orders so JOIN customers c ON c.id=so.customer_id JOIN locations l ON l.id=so.location_id
    WHERE so.org_id=$1 AND ($2::text IS NULL OR ($2='OPEN' AND so.status IN ('OPEN','ALLOCATED','PARTIAL')) OR so.status::text=$2) AND ($3::int IS NULL OR so.location_id=$3)
    ORDER BY CASE WHEN so.status IN ('DELIVERED','CANCELLED') THEN 1 ELSE 0 END, so.promised_date, so.priority LIMIT 400`, [org, f.status ?? null, f.location_id ?? null]);
export async function getSO(org: number, id: number) {
  const so = await one(`SELECT so.*, c.name AS customer, c.code AS customer_code, c.city, c.address, c.phone, c.gstin, l.code AS location_code, l.name AS location_name
                          FROM sales_orders so JOIN customers c ON c.id=so.customer_id JOIN locations l ON l.id=so.location_id WHERE so.org_id=$1 AND so.id=$2`, [org, id]);
  if (!so) throw new HttpError(404, 'Sales order not found');
  const lines = await query(`SELECT l.*, i.code, i.name, i.uom, i.weight_kg, COALESCE(s.on_hand,0) - COALESCE(s.reserved,0) AS free FROM so_lines l JOIN items i ON i.id=l.item_id
                               LEFT JOIN stock s ON s.item_id=l.item_id AND s.location_id=$2 WHERE l.so_id=$1 ORDER BY l.id`, [id, so.location_id]);
  const shipments = await query(`SELECT sh.id, sh.shp_no, sh.status, st.status AS stop_status, st.receiver_name, st.delivered_at FROM shipment_stops st JOIN shipments sh ON sh.id=st.shipment_id WHERE st.so_id=$1 ORDER BY sh.id`, [id]);
  return { ...so, lines, shipments };
}

// ================================================================ Shipments (trips) & proof of delivery
const freightFor = (t: any, kg: number) => (t ? r2(Math.max(Number(t.min_charge), kg * Number(t.rate_per_kg))) : 0);
async function checkVehicle(c: PoolClient, org: number, vehicleId: number | null, kg: number) {
  if (!vehicleId) return null;
  const { rows: [v] } = await c.query(`SELECT * FROM vehicles WHERE id=$1 AND org_id=$2`, [vehicleId, org]);
  if (!v) throw new HttpError(422, 'Unknown vehicle');
  if (kg > Number(v.capacity_kg)) throw new HttpError(422, `Load ${Math.round(kg)} kg exceeds ${v.reg_no} capacity ${Number(v.capacity_kg)} kg`);
  return v;
}
async function checkDriver(c: PoolClient, org: number, driverId: number | null) {
  if (!driverId) return;
  const { rows: [m] } = await c.query(`SELECT role FROM memberships WHERE org_id=$1 AND user_id=$2`, [org, driverId]);
  if (m?.role !== 'DRIVER') throw new HttpError(422, 'Assigned user is not a driver');
}
/** Plan a delivery trip: allocated quantities of the chosen orders, one stop per order, weight checked against the vehicle */
export async function createShipment(s: Session, d: any) {
  return tx(async c => {
    const { rows: sos } = await c.query(`SELECT * FROM sales_orders WHERE org_id=$1 AND id = ANY($2) FOR UPDATE`, [s.orgId, d.so_ids]);
    if (sos.length !== new Set(d.so_ids).size) throw new HttpError(422, 'Unknown sales order');
    if (sos.some(x => x.location_id !== d.from_location_id)) throw new HttpError(422, 'All orders on a trip must ship from the same location');
    const { rows: planned } = await c.query(`SELECT so.so_no FROM shipment_stops st JOIN shipments sh ON sh.id=st.shipment_id JOIN sales_orders so ON so.id=st.so_id WHERE st.so_id = ANY($1) AND sh.status='PLANNED'`, [d.so_ids]);
    if (planned.length) throw new HttpError(422, `${planned.map(p => p.so_no).join(', ')} already on a planned trip`);
    const { rows: lines } = await c.query(`SELECT l.*, i.weight_kg FROM so_lines l JOIN items i ON i.id=l.item_id WHERE l.so_id = ANY($1) AND l.allocated_qty > 0`, [d.so_ids]);
    const noAlloc = sos.filter(so => !lines.some(l => l.so_id === so.id)); if (noAlloc.length) throw new HttpError(422, `${noAlloc.map(x => x.so_no).join(', ')} has no allocated stock — allocate first`);
    const kg = lines.reduce((a, l) => a + Number(l.allocated_qty) * Number(l.weight_kg), 0), value = lines.reduce((a, l) => a + Number(l.allocated_qty) * Number(l.price) * (1 + Number(l.gst_rate) / 100), 0);
    const v = await checkVehicle(c, s.orgId, d.vehicle_id, kg); await checkDriver(c, s.orgId, d.driver_id);
    const tid = d.transporter_id ?? v?.transporter_id ?? null; const { rows: [t] } = tid ? await c.query(`SELECT * FROM transporters WHERE id=$1 AND org_id=$2`, [tid, s.orgId]) : { rows: [null] };
    const { rows: [sh] } = await c.query(`INSERT INTO shipments(org_id, shp_no, type, from_location_id, transporter_id, vehicle_id, driver_id, planned_date, total_weight, total_value, freight_cost, created_by)
                                           VALUES ($1, next_no($1,'SHP'), 'SALES', $2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [s.orgId, d.from_location_id, tid, d.vehicle_id, d.driver_id, d.planned_date ?? today(), r2(kg), r2(value), freightFor(t, kg), s.uid]);
    let seq = 0;
    for (const so of d.so_ids.map((x: number) => sos.find(y => y.id === x))) {
      const { rows: [st] } = await c.query(`INSERT INTO shipment_stops(shipment_id, seq, so_id) VALUES ($1,$2,$3) RETURNING id`, [sh.id, ++seq, so.id]);
      for (const l of lines.filter(x => x.so_id === so.id)) await c.query(`INSERT INTO shipment_lines(shipment_id, stop_id, item_id, so_line_id, qty) VALUES ($1,$2,$3,$4,$5)`, [sh.id, st.id, l.item_id, l.id, l.allocated_qty]);
    }
    return sh;
  });
}
/** Dispatch: e-way bill above the limit, reservation released, stock out at average cost, demand history updated */
export async function dispatchShipment(s: Session, id: number, ewb: string | null) {
  return tx(async c => {
    const { rows: [sh] } = await c.query(`SELECT sh.*, o.eway_bill_limit FROM shipments sh JOIN organizations o ON o.id=sh.org_id WHERE sh.id=$1 AND sh.org_id=$2 FOR UPDATE OF sh`, [id, s.orgId]);
    if (!sh) throw new HttpError(404, 'Shipment not found');
    if (sh.status !== 'PLANNED') throw new HttpError(422, `Shipment is ${sh.status}`);
    if (sh.type !== 'SALES') throw new HttpError(422, 'Transfers are dispatched from the transfer order');
    if (!sh.vehicle_id) throw new HttpError(422, 'Assign a vehicle before dispatch');
    const eway = ewb ?? sh.eway_bill_no; if (Number(sh.total_value) > Number(sh.eway_bill_limit) && !eway) throw new HttpError(422, `Consignment value ₹${Number(sh.total_value).toLocaleString('en-IN')} exceeds ₹${Number(sh.eway_bill_limit).toLocaleString('en-IN')} — enter the e-way bill number`);
    const { rows: lines } = await c.query(`SELECT sl.*, l.allocated_qty, l.so_id, i.avg_cost, so.so_no FROM shipment_lines sl JOIN so_lines l ON l.id=sl.so_line_id JOIN items i ON i.id=sl.item_id
                                             JOIN sales_orders so ON so.id=l.so_id WHERE sl.shipment_id=$1 FOR UPDATE OF l`, [id]);
    for (const l of lines) {
      if (Number(l.allocated_qty) < Number(l.qty)) throw new HttpError(422, `${l.so_no}: allocation changed since the trip was planned — re-plan the trip`);
      await c.query(`UPDATE stock SET reserved=reserved-$3 WHERE item_id=$1 AND location_id=$2`, [l.item_id, sh.from_location_id, l.qty]);
      await c.query(`UPDATE so_lines SET allocated_qty=allocated_qty-$2, shipped_qty=shipped_qty+$2 WHERE id=$1`, [l.so_line_id, l.qty]);
      await move(c, s, { item: l.item_id, loc: sh.from_location_id, qty: -Number(l.qty), type: 'DISPATCH', cost: Number(l.avg_cost), refType: 'SHIPMENT', refId: sh.id, refNo: sh.shp_no });
      await recordDemand(c, l.item_id, sh.from_location_id, Number(l.qty), today());
    }
    for (const so of new Set(lines.map(l => l.so_id))) await soStatus(c, so);
    return (await c.query(`UPDATE shipments SET status='DISPATCHED', eway_bill_no=$2, dispatched_at=now() WHERE id=$1 RETURNING *`, [id, eway])).rows[0];
  });
}
/**
 * Proof of delivery for one stop (driver app). Receiver name is mandatory; every short quantity needs a reason.
 * REFUSED goods come back into stock at the origin and reopen the order line; damaged / short-loaded are losses.
 */
export async function deliverStop(s: Session, shipmentId: number, stopId: number, d: any) {
  return tx(async c => {
    const { rows: [sh] } = await c.query(`SELECT * FROM shipments WHERE id=$1 AND org_id=$2 FOR UPDATE`, [shipmentId, s.orgId]);
    if (!sh) throw new HttpError(404, 'Shipment not found');
    if (s.role === 'DRIVER' && sh.driver_id !== s.uid) throw new HttpError(403, 'This trip is assigned to another driver');
    if (sh.status !== 'DISPATCHED') throw new HttpError(422, sh.status === 'PLANNED' ? 'Trip has not been dispatched yet' : `Trip is ${sh.status}`);
    const { rows: [st] } = await c.query(`SELECT * FROM shipment_stops WHERE id=$1 AND shipment_id=$2 FOR UPDATE`, [stopId, shipmentId]);
    if (!st) throw new HttpError(404, 'Stop not found');
    if (!st.so_id) throw new HttpError(422, 'Transfers are received by the destination warehouse');
    if (st.status !== 'PENDING') throw new HttpError(422, 'This stop is already closed');
    const { rows: lines } = await c.query(`SELECT sl.*, i.code, i.avg_cost FROM shipment_lines sl JOIN items i ON i.id=sl.item_id WHERE sl.stop_id=$1`, [stopId]);
    if (d.lines.length !== lines.length || !lines.every(l => d.lines.some((x: any) => x.line_id === l.id))) throw new HttpError(422, 'Give the delivered quantity for every line on this stop');
    let short = false;
    for (const l of lines) {
      const x = d.lines.find((y: any) => y.line_id === l.id), q = Number(x.delivered_qty), gap = Number(l.qty) - q;
      if (q > Number(l.qty)) throw new HttpError(422, `${l.code}: delivered ${q} is more than shipped ${Number(l.qty)}`);
      if (gap > 0 && !x.short_reason) throw new HttpError(422, `${l.code}: give a reason for the ${gap} short`);
      if (gap > 0) short = true;
      await c.query(`UPDATE shipment_lines SET delivered_qty=$2, short_reason=$3 WHERE id=$1`, [l.id, q, gap > 0 ? x.short_reason : null]);
      await c.query(`UPDATE so_lines SET delivered_qty=delivered_qty+$2 WHERE id=$1`, [l.so_line_id, q]);
      if (gap > 0 && x.short_reason === 'REFUSED') {
        await move(c, s, { item: l.item_id, loc: sh.from_location_id, qty: gap, type: 'RETURN', cost: Number(l.avg_cost), refType: 'SHIPMENT', refId: sh.id, refNo: sh.shp_no, note: 'Refused by customer' });
        await c.query(`UPDATE so_lines SET shipped_qty=shipped_qty-$2 WHERE id=$1`, [l.so_line_id, gap]);
      }
    }
    await c.query(`UPDATE shipment_stops SET status=$2, receiver_name=$3, pod_photo=$4, pod_lat=$5, pod_lng=$6, remarks=$7, delivered_at=now() WHERE id=$1`,
      [stopId, short ? 'PARTIAL' : 'DELIVERED', d.receiver_name, d.pod_photo ?? null, d.lat, d.lng, d.remarks]);
    await soStatus(c, st.so_id);
    const { rows: [left] } = await c.query(`SELECT COUNT(*) FILTER (WHERE status='PENDING') AS pending, COUNT(*) FILTER (WHERE status IN ('PARTIAL','FAILED')) AS bad FROM shipment_stops WHERE shipment_id=$1`, [shipmentId]);
    if (Number(left.pending) === 0) await c.query(`UPDATE shipments SET status=$2, delivered_at=now() WHERE id=$1`, [shipmentId, Number(left.bad) ? 'PARTIAL' : 'DELIVERED']);
    return { stop: short ? 'PARTIAL' : 'DELIVERED', trip_complete: Number(left.pending) === 0 };
  });
}
export async function cancelShipment(s: Session, id: number) {
  const r = await one(`UPDATE shipments SET status='CANCELLED' WHERE id=$1 AND org_id=$2 AND status='PLANNED' AND type='SALES' RETURNING *`, [id, s.orgId]);
  if (!r) throw new HttpError(422, 'Only planned sales trips can be cancelled');
  return r;
}
export const listShipments = (org: number, f: { status?: string; driver_id?: number }) => query(
  `SELECT sh.*, l.code AS from_code, t.name AS transporter, v.reg_no, v.capacity_kg, u.name AS driver, tl.code AS to_code, tor.to_no,
          (SELECT COUNT(*) FROM shipment_stops WHERE shipment_id=sh.id) AS stops, (SELECT COUNT(*) FROM shipment_stops WHERE shipment_id=sh.id AND status<>'PENDING') AS stops_done,
          (SELECT string_agg(c.name, ' → ' ORDER BY st.seq) FROM shipment_stops st JOIN sales_orders so ON so.id=st.so_id JOIN customers c ON c.id=so.customer_id WHERE st.shipment_id=sh.id) AS route
     FROM shipments sh JOIN locations l ON l.id=sh.from_location_id LEFT JOIN transporters t ON t.id=sh.transporter_id LEFT JOIN vehicles v ON v.id=sh.vehicle_id
     LEFT JOIN users u ON u.id=sh.driver_id LEFT JOIN transfer_orders tor ON tor.id=sh.transfer_order_id LEFT JOIN locations tl ON tl.id=tor.to_location_id
    WHERE sh.org_id=$1 AND ($2::text IS NULL OR ($2='ACTIVE' AND sh.status IN ('PLANNED','DISPATCHED')) OR sh.status::text=$2) AND ($3::int IS NULL OR sh.driver_id=$3)
    ORDER BY CASE WHEN sh.status IN ('PLANNED','DISPATCHED') THEN 0 ELSE 1 END, sh.id DESC LIMIT 300`, [org, f.status ?? null, f.driver_id ?? null]);
export async function getShipment(org: number, id: number, s?: Session) {
  const sh = await one(`SELECT sh.*, l.code AS from_code, l.name AS from_name, l.city AS from_city, t.name AS transporter, v.reg_no, v.type AS vehicle_type, v.capacity_kg, u.name AS driver, u.phone AS driver_phone, tor.to_no
                          FROM shipments sh JOIN locations l ON l.id=sh.from_location_id LEFT JOIN transporters t ON t.id=sh.transporter_id LEFT JOIN vehicles v ON v.id=sh.vehicle_id
                          LEFT JOIN users u ON u.id=sh.driver_id LEFT JOIN transfer_orders tor ON tor.id=sh.transfer_order_id WHERE sh.org_id=$1 AND sh.id=$2`, [org, id]);
  if (!sh) throw new HttpError(404, 'Shipment not found');
  if (s?.role === 'DRIVER' && sh.driver_id !== s.uid) throw new HttpError(403, 'This trip is assigned to another driver');
  const stops = await query(`SELECT st.*, so.so_no, so.promised_date, c.name AS customer, c.city, c.address, c.phone, tl.code AS to_code, tl.name AS to_name,
                                    (SELECT json_agg(json_build_object('id', sl.id, 'item_id', sl.item_id, 'code', i.code, 'name', i.name, 'uom', i.uom, 'qty', sl.qty, 'delivered_qty', sl.delivered_qty, 'short_reason', sl.short_reason) ORDER BY sl.id)
                                       FROM shipment_lines sl JOIN items i ON i.id=sl.item_id WHERE sl.stop_id=st.id) AS lines
                               FROM shipment_stops st LEFT JOIN sales_orders so ON so.id=st.so_id LEFT JOIN customers c ON c.id=so.customer_id LEFT JOIN locations tl ON tl.id=st.to_location_id
                              WHERE st.shipment_id=$1 ORDER BY st.seq`, [id]);
  return { ...sh, stops };
}

// ================================================================ Transfer orders (inter-location)
export const listTOs = (org: number, f: { status?: string; location_id?: number }) => query(
  `SELECT t.*, fl.code AS from_code, tl.code AS to_code, (SELECT SUM(qty) FROM to_lines WHERE to_id=t.id) AS qty, (SELECT SUM(shipped_qty) FROM to_lines WHERE to_id=t.id) AS shipped,
          (SELECT SUM(received_qty) FROM to_lines WHERE to_id=t.id) AS received, (SELECT string_agg(i.code, ', ') FROM to_lines l JOIN items i ON i.id=l.item_id WHERE l.to_id=t.id) AS items,
          (SELECT shp_no FROM shipments WHERE transfer_order_id=t.id ORDER BY id DESC LIMIT 1) AS shp_no,
          (t.status IN ('DRAFT','RELEASED','DISPATCHED') AND t.need_date < CURRENT_DATE) AS late
     FROM transfer_orders t JOIN locations fl ON fl.id=t.from_location_id JOIN locations tl ON tl.id=t.to_location_id
    WHERE t.org_id=$1 AND ($2::text IS NULL OR ($2='OPEN' AND t.status IN ('DRAFT','RELEASED','DISPATCHED')) OR t.status::text=$2)
      AND ($3::int IS NULL OR t.from_location_id=$3 OR t.to_location_id=$3) ORDER BY CASE WHEN t.status IN ('RECEIVED','CANCELLED') THEN 1 ELSE 0 END, t.need_date, t.id LIMIT 300`,
  [org, f.status ?? null, f.location_id ?? null]);
export async function getTO(org: number, id: number) {
  const t = await one(`SELECT t.*, fl.code AS from_code, fl.name AS from_name, tl.code AS to_code, tl.name AS to_name, tl.transit_days, u.name AS received_by_name
                         FROM transfer_orders t JOIN locations fl ON fl.id=t.from_location_id JOIN locations tl ON tl.id=t.to_location_id LEFT JOIN users u ON u.id=t.received_by WHERE t.org_id=$1 AND t.id=$2`, [org, id]);
  if (!t) throw new HttpError(404, 'Transfer order not found');
  const lines = await query(`SELECT l.*, i.code, i.name, i.uom, i.weight_kg, i.avg_cost, COALESCE(s.on_hand,0) - COALESCE(s.reserved,0) AS free_at_source FROM to_lines l JOIN items i ON i.id=l.item_id
                               LEFT JOIN stock s ON s.item_id=l.item_id AND s.location_id=$2 WHERE l.to_id=$1 ORDER BY l.id`, [id, t.from_location_id]);
  const shipment = await one(`SELECT sh.id, sh.shp_no, sh.status, v.reg_no, u.name AS driver, sh.eway_bill_no, sh.dispatched_at FROM shipments sh LEFT JOIN vehicles v ON v.id=sh.vehicle_id LEFT JOIN users u ON u.id=sh.driver_id
                               WHERE sh.transfer_order_id=$1 ORDER BY sh.id DESC LIMIT 1`, [id]);
  return { ...t, lines, shipment };
}
export async function createTO(s: Session, d: any) {
  return tx(async c => {
    const { rows: locs } = await c.query(`SELECT id FROM locations WHERE org_id=$1 AND id IN ($2,$3)`, [s.orgId, d.from_location_id, d.to_location_id]);
    if (locs.length !== 2) throw new HttpError(422, 'Unknown location');
    const { rows: [t] } = await c.query(`INSERT INTO transfer_orders(org_id, to_no, from_location_id, to_location_id, need_date, created_by) VALUES ($1, next_no($1,'TO'), $2,$3,$4,$5) RETURNING *`,
      [s.orgId, d.from_location_id, d.to_location_id, d.need_date, s.uid]);
    for (const l of d.lines) await c.query(`INSERT INTO to_lines(to_id, item_id, qty) VALUES ($1,$2,$3)`, [t.id, l.item_id, l.qty]);
    return t;
  });
}
/** Release reserves the full quantity at the source; a shortage stops the release (no partial transfers) */
export async function releaseTO(s: Session, id: number) {
  return tx(async c => {
    const { rows: [t] } = await c.query(`SELECT * FROM transfer_orders WHERE id=$1 AND org_id=$2 FOR UPDATE`, [id, s.orgId]);
    if (!t) throw new HttpError(404, 'Not found');
    if (t.status !== 'DRAFT') throw new HttpError(422, `Transfer is ${t.status}`);
    const { rows: lines } = await c.query(`SELECT l.*, i.code FROM to_lines l JOIN items i ON i.id=l.item_id WHERE to_id=$1`, [id]);
    for (const l of lines) {
      await c.query(`INSERT INTO stock(item_id, location_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [l.item_id, t.from_location_id]);
      const { rows: [st] } = await c.query(`SELECT on_hand - reserved AS free FROM stock WHERE item_id=$1 AND location_id=$2 FOR UPDATE`, [l.item_id, t.from_location_id]);
      if (Number(st.free) < Number(l.qty)) throw new HttpError(422, `${l.code}: only ${Number(st.free)} free at source, transfer needs ${Number(l.qty)}`);
      await c.query(`UPDATE stock SET reserved=reserved+$3 WHERE item_id=$1 AND location_id=$2`, [l.item_id, t.from_location_id, l.qty]);
      await c.query(`UPDATE to_lines SET allocated_qty=qty WHERE id=$1`, [l.id]);
    }
    return (await c.query(`UPDATE transfer_orders SET status='RELEASED' WHERE id=$1 RETURNING *`, [id])).rows[0];
  });
}
/** Ship a released transfer: creates the TRANSFER shipment, stock leaves the source and is in transit until received */
export async function shipTransfer(s: Session, id: number, d: any) {
  return tx(async c => {
    const { rows: [t] } = await c.query(`SELECT t.*, o.eway_bill_limit FROM transfer_orders t JOIN organizations o ON o.id=t.org_id WHERE t.id=$1 AND t.org_id=$2 FOR UPDATE OF t`, [id, s.orgId]);
    if (!t) throw new HttpError(404, 'Not found');
    if (t.status !== 'RELEASED') throw new HttpError(422, t.status === 'DRAFT' ? 'Release the transfer first (reserves stock at source)' : `Transfer is ${t.status}`);
    assertLocation(s, t.from_location_id);
    const { rows: lines } = await c.query(`SELECT l.*, i.weight_kg, i.avg_cost FROM to_lines l JOIN items i ON i.id=l.item_id WHERE to_id=$1`, [id]);
    const kg = lines.reduce((a, l) => a + Number(l.qty) * Number(l.weight_kg), 0), value = lines.reduce((a, l) => a + Number(l.qty) * Number(l.avg_cost), 0);
    if (!d.vehicle_id) throw new HttpError(422, 'Assign a vehicle');
    const v = await checkVehicle(c, s.orgId, d.vehicle_id, kg); await checkDriver(c, s.orgId, d.driver_id);
    // stock transfer between own branches in different states is a taxable supply → e-way bill above the limit
    if (value > Number(t.eway_bill_limit) && !d.eway_bill_no) throw new HttpError(422, `Consignment value ₹${Math.round(value).toLocaleString('en-IN')} exceeds ₹${Number(t.eway_bill_limit).toLocaleString('en-IN')} — enter the e-way bill number`);
    const tid = d.transporter_id ?? v.transporter_id; const { rows: [tr] } = tid ? await c.query(`SELECT * FROM transporters WHERE id=$1`, [tid]) : { rows: [null] };
    const { rows: [sh] } = await c.query(`INSERT INTO shipments(org_id, shp_no, type, from_location_id, transfer_order_id, transporter_id, vehicle_id, driver_id, status, total_weight, total_value, freight_cost, eway_bill_no, dispatched_at, created_by)
                                           VALUES ($1, next_no($1,'SHP'), 'TRANSFER', $2,$3,$4,$5,$6,'DISPATCHED',$7,$8,$9,$10, now(), $11) RETURNING *`,
      [s.orgId, t.from_location_id, t.id, tid, d.vehicle_id, d.driver_id, r2(kg), r2(value), freightFor(tr, kg), d.eway_bill_no, s.uid]);
    const { rows: [st] } = await c.query(`INSERT INTO shipment_stops(shipment_id, seq, to_location_id) VALUES ($1,1,$2) RETURNING id`, [sh.id, t.to_location_id]);
    for (const l of lines) {
      await c.query(`UPDATE stock SET reserved=reserved-$3 WHERE item_id=$1 AND location_id=$2`, [l.item_id, t.from_location_id, l.allocated_qty]);
      await move(c, s, { item: l.item_id, loc: t.from_location_id, qty: -Number(l.qty), type: 'TRANSFER_OUT', cost: Number(l.avg_cost), refType: 'TO', refId: t.id, refNo: t.to_no });
      await c.query(`UPDATE to_lines SET shipped_qty=qty, allocated_qty=0 WHERE id=$1`, [l.id]);
      await c.query(`INSERT INTO shipment_lines(shipment_id, stop_id, item_id, to_line_id, qty) VALUES ($1,$2,$3,$4,$5)`, [sh.id, st.id, l.item_id, l.id, l.qty]);
    }
    await c.query(`UPDATE transfer_orders SET status='DISPATCHED' WHERE id=$1`, [id]);
    return sh;
  });
}
/** Destination warehouse receives; any shortage is a transit loss and needs a reason */
export async function receiveTransfer(s: Session, id: number, d: any) {
  return tx(async c => {
    const { rows: [t] } = await c.query(`SELECT * FROM transfer_orders WHERE id=$1 AND org_id=$2 FOR UPDATE`, [id, s.orgId]);
    if (!t) throw new HttpError(404, 'Not found');
    if (t.status !== 'DISPATCHED') throw new HttpError(422, `Transfer is ${t.status} — nothing in transit`);
    assertLocation(s, t.to_location_id);
    const { rows: lines } = await c.query(`SELECT l.*, i.code, i.avg_cost FROM to_lines l JOIN items i ON i.id=l.item_id WHERE to_id=$1`, [id]);
    if (d.lines.length !== lines.length) throw new HttpError(422, 'Enter the received quantity for every line');
    let short = false;
    for (const l of lines) {
      const x = d.lines.find((y: any) => y.to_line_id === l.id); if (!x) throw new HttpError(422, 'Line mismatch');
      const q = Number(x.received_qty), gap = Number(l.shipped_qty) - q;
      if (q > Number(l.shipped_qty)) throw new HttpError(422, `${l.code}: received ${q} is more than shipped ${Number(l.shipped_qty)}`);
      if (gap > 0 && !x.short_reason) throw new HttpError(422, `${l.code}: ${gap} short — record the reason (transit loss / damage)`);
      if (gap > 0) short = true;
      if (q > 0) await move(c, s, { item: l.item_id, loc: t.to_location_id, qty: q, type: 'TRANSFER_IN', cost: Number(l.avg_cost), refType: 'TO', refId: t.id, refNo: t.to_no });
      await c.query(`UPDATE to_lines SET received_qty=$2, short_reason=$3 WHERE id=$1`, [l.id, q, gap > 0 ? x.short_reason : null]);
    }
    await c.query(`UPDATE transfer_orders SET status='RECEIVED', received_on=CURRENT_DATE, received_by=$2 WHERE id=$1`, [id, s.uid]);
    const { rows: [sh] } = await c.query(`UPDATE shipments SET status=$2, delivered_at=now() WHERE transfer_order_id=$1 AND status='DISPATCHED' RETURNING id`, [id, short ? 'PARTIAL' : 'DELIVERED']);
    if (sh) await c.query(`UPDATE shipment_stops SET status=$2, delivered_at=now(), receiver_name=$3 WHERE shipment_id=$1`, [sh.id, short ? 'PARTIAL' : 'DELIVERED', s.name]);
    return { status: 'RECEIVED', short };
  });
}

// ================================================================ Inventory
export async function stockView(org: number, f: { location_id?: number; q?: string; type?: string; health?: string }) {
  const rows = await query(`SELECT i.id AS item_id, i.code, i.name, i.type, i.uom, i.avg_cost, l.id AS location_id, l.code AS location_code,
                       COALESCE(s.on_hand,0) AS on_hand, COALESCE(s.reserved,0) AS reserved, COALESCE(s.on_hand,0) - COALESCE(s.reserved,0) AS free,
                       il.safety_stock, il.reorder_point, il.avg_daily_demand, il.abc, il.xyz,
                       COALESCE((SELECT SUM(qty) FROM v_in_transit t WHERE t.item_id=i.id AND t.to_location_id=l.id),0) AS in_transit,
                       COALESCE((SELECT SUM(pl.qty-pl.accepted_qty) FROM po_lines pl JOIN purchase_orders p ON p.id=pl.po_id WHERE pl.item_id=i.id AND p.location_id=l.id AND p.status IN ('APPROVED','PARTIAL')),0) AS on_order,
                       CASE WHEN il.avg_daily_demand > 0 THEN ROUND(COALESCE(s.on_hand,0) / il.avg_daily_demand, 1) END AS days_cover,
                       CASE WHEN COALESCE(s.on_hand,0) <= 0 AND il.avg_daily_demand > 0 THEN 'STOCKOUT'
                            WHEN COALESCE(s.on_hand,0) < il.safety_stock THEN 'BELOW_SS'
                            WHEN COALESCE(s.on_hand,0) < il.reorder_point THEN 'REORDER'
                            WHEN il.avg_daily_demand > 0 AND COALESCE(s.on_hand,0) > il.reorder_point + 60 * il.avg_daily_demand THEN 'EXCESS'
                            WHEN il.avg_daily_demand = 0 AND COALESCE(s.on_hand,0) > 0 THEN 'NO_DEMAND' ELSE 'HEALTHY' END AS health
                  FROM item_locations il JOIN items i ON i.id=il.item_id JOIN locations l ON l.id=il.location_id LEFT JOIN stock s ON s.item_id=il.item_id AND s.location_id=il.location_id
                 WHERE i.org_id=$1 AND ($2::int IS NULL OR l.id=$2) AND ($3::text IS NULL OR i.code ILIKE '%'||$3||'%' OR i.name ILIKE '%'||$3||'%') AND ($4::text IS NULL OR i.type::text=$4)
                 ORDER BY l.code, i.type, i.code`, [org, f.location_id ?? null, f.q ?? null, f.type ?? null]);
  if (f.health) {
    return (rows as any[]).filter((r) => r.health === f.health);
  }
  return rows;
}
export const moves = (org: number, itemId: number, locationId?: number) => query(
  `SELECT m.*, l.code AS location_code, u.name AS user_name, SUM(m.qty) OVER (PARTITION BY m.location_id ORDER BY m.move_date, m.id) AS balance
     FROM stock_moves m JOIN locations l ON l.id=m.location_id LEFT JOIN users u ON u.id=m.user_id
    WHERE m.org_id=$1 AND m.item_id=$2 AND ($3::int IS NULL OR m.location_id=$3) ORDER BY m.move_date DESC, m.id DESC LIMIT 300`, [org, itemId, locationId ?? null]);
export async function adjustStock(s: Session, d: any) {
  assertLocation(s, d.location_id);
  return tx(async c => {
    const { rows: [it] } = await c.query(`SELECT avg_cost FROM items WHERE id=$1 AND org_id=$2`, [d.item_id, s.orgId]); if (!it) throw new HttpError(422, 'Unknown item');
    await move(c, s, { item: d.item_id, loc: d.location_id, qty: d.qty, type: 'ADJUSTMENT', cost: Number(it.avg_cost), refType: 'ADJUSTMENT', refId: 0, refNo: 'ADJ', note: d.reason });
    return { ok: true };
  });
}
