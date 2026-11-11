import { PoolClient } from 'pg';
import { one, query, tx } from '../db';
import { HttpError, Session, assertLocation } from '../auth';
import { r2 } from '../money';
import { addDays, today } from '../dates';

// ---------------------------------------------------------------- Requisitions
export const listPRs = (org: number, status?: string) => query(
  `SELECT pr.*, l.code AS location_code, u.name AS requested_by_name, a.name AS approved_by_name,
          (SELECT COUNT(*) FROM pr_lines WHERE pr_id=pr.id) AS lines, (SELECT COALESCE(SUM(qty*est_price),0) FROM pr_lines WHERE pr_id=pr.id) AS est_value,
          (SELECT string_agg(i.code, ', ') FROM pr_lines pl JOIN items i ON i.id=pl.item_id WHERE pl.pr_id=pr.id) AS items
     FROM purchase_requisitions pr JOIN locations l ON l.id=pr.location_id LEFT JOIN users u ON u.id=pr.requested_by LEFT JOIN users a ON a.id=pr.approved_by
    WHERE pr.org_id=$1 AND ($2::text IS NULL OR ($2='OPEN' AND pr.status IN ('DRAFT','SUBMITTED','APPROVED','RFQ')) OR pr.status::text=$2) ORDER BY pr.id DESC LIMIT 300`, [org, status ?? null]);
export async function getPR(org: number, id: number) {
  const pr = await one(`SELECT pr.*, l.code AS location_code, l.name AS location_name, u.name AS requested_by_name, a.name AS approved_by_name FROM purchase_requisitions pr
                         JOIN locations l ON l.id=pr.location_id LEFT JOIN users u ON u.id=pr.requested_by LEFT JOIN users a ON a.id=pr.approved_by WHERE pr.org_id=$1 AND pr.id=$2`, [org, id]);
  if (!pr) throw new HttpError(404, 'Requisition not found');
  const lines = await query(`SELECT pl.*, i.code, i.name, i.uom, (SELECT json_agg(json_build_object('supplier_id', s.id, 'name', s.name, 'status', s.status, 'price', si.price, 'lead', si.lead_time_days, 'preferred', si.preferred))
                                FROM supplier_items si JOIN suppliers s ON s.id=si.supplier_id WHERE si.item_id=pl.item_id) AS sources
                               FROM pr_lines pl JOIN items i ON i.id=pl.item_id WHERE pl.pr_id=$1 ORDER BY pl.id`, [id]);
  const rfq = await one(`SELECT id, rfq_no, status FROM rfqs WHERE pr_id=$1 ORDER BY id DESC LIMIT 1`, [id]);
  const pos = await query(`SELECT id, po_no, status, total FROM purchase_orders WHERE pr_id=$1 ORDER BY id`, [id]);
  return { ...pr, lines, rfq, pos };
}
export async function createPR(s: Session, d: any) {
  return tx(async c => {
    const { rows: [pr] } = await c.query(`INSERT INTO purchase_requisitions(org_id, pr_no, location_id, need_date, status, remarks, requested_by)
                                           VALUES ($1, next_no($1,'PR'), $2, $3, 'SUBMITTED', $4, $5) RETURNING *`, [s.orgId, d.location_id, d.need_date, d.remarks, s.uid]);
    for (const l of d.lines) await c.query(`INSERT INTO pr_lines(pr_id, item_id, qty, est_price) VALUES ($1,$2,$3,COALESCE(NULLIF($4,0),(SELECT std_cost FROM items WHERE id=$2)))`, [pr.id, l.item_id, l.qty, l.est_price]);
    return pr;
  });
}
export async function approvePR(s: Session, id: number) {
  const pr = await one(`SELECT * FROM purchase_requisitions WHERE id=$1 AND org_id=$2`, [id, s.orgId]);
  if (!pr) throw new HttpError(404, 'Not found');
  if (pr.status !== 'SUBMITTED') throw new HttpError(422, `Requisition is ${pr.status}`);
  if (pr.requested_by === s.uid && s.role !== 'ADMIN') throw new HttpError(403, 'You cannot approve your own requisition');
  return one(`UPDATE purchase_requisitions SET status='APPROVED', approved_by=$2, approved_at=now() WHERE id=$1 RETURNING *`, [id, s.uid]);
}
export async function rejectPR(s: Session, id: number, reason: string) {
  const r = await one(`UPDATE purchase_requisitions SET status='REJECTED', reject_reason=$3, approved_by=$4 WHERE id=$1 AND org_id=$2 AND status='SUBMITTED' RETURNING *`, [id, s.orgId, reason, s.uid]);
  if (!r) throw new HttpError(422, 'Only submitted requisitions can be rejected');
  return r;
}

// ---------------------------------------------------------------- RFQ & quote comparison
export async function createRFQ(s: Session, d: { pr_id: number; supplier_ids: number[]; due_date: string }) {
  return tx(async c => {
    const { rows: [pr] } = await c.query(`SELECT * FROM purchase_requisitions WHERE id=$1 AND org_id=$2 FOR UPDATE`, [d.pr_id, s.orgId]);
    if (!pr) throw new HttpError(404, 'Requisition not found');
    if (pr.status !== 'APPROVED') throw new HttpError(422, 'Only approved requisitions can go to RFQ');
    const { rows: sups } = await c.query(`SELECT id, name, status FROM suppliers WHERE org_id=$1 AND id = ANY($2)`, [s.orgId, d.supplier_ids]);
    if (sups.length !== new Set(d.supplier_ids).size) throw new HttpError(422, 'Unknown supplier');
    const blocked = sups.filter(x => x.status === 'BLOCKED'); if (blocked.length) throw new HttpError(422, `${blocked.map(b => b.name).join(', ')} is blocked and cannot be invited`);
    if (d.due_date < today()) throw new HttpError(422, 'Quote due date is in the past');
    const { rows: [r] } = await c.query(`INSERT INTO rfqs(org_id, rfq_no, pr_id, location_id, due_date, need_date, created_by) VALUES ($1, next_no($1,'RFQ'), $2, $3, $4, $5, $6) RETURNING *`,
      [s.orgId, pr.id, pr.location_id, d.due_date, pr.need_date, s.uid]);
    await c.query(`INSERT INTO rfq_lines(rfq_id, item_id, qty) SELECT $1, item_id, SUM(qty) FROM pr_lines WHERE pr_id=$2 GROUP BY item_id`, [r.id, pr.id]);
    for (const sid of new Set(d.supplier_ids)) await c.query(`INSERT INTO rfq_suppliers VALUES ($1,$2)`, [r.id, sid]);
    await c.query(`UPDATE purchase_requisitions SET status='RFQ' WHERE id=$1`, [pr.id]);
    return r;
  });
}
export async function submitQuote(s: Session, rfqId: number, d: any) {
  return tx(async c => {
    const { rows: [r] } = await c.query(`SELECT * FROM rfqs WHERE id=$1 AND org_id=$2`, [rfqId, s.orgId]);
    if (!r) throw new HttpError(404, 'RFQ not found');
    if (r.status !== 'OPEN') throw new HttpError(422, `RFQ is ${r.status}`);
    const { rowCount } = await c.query(`SELECT 1 FROM rfq_suppliers WHERE rfq_id=$1 AND supplier_id=$2`, [rfqId, d.supplier_id]);
    if (!rowCount) throw new HttpError(422, 'This supplier was not invited to the RFQ');
    for (const l of d.lines) {
      const { rowCount: ok } = await c.query(`SELECT 1 FROM rfq_lines WHERE id=$1 AND rfq_id=$2`, [l.rfq_line_id, rfqId]); if (!ok) throw new HttpError(422, 'Line does not belong to this RFQ');
      await c.query(`INSERT INTO quotes(rfq_id, supplier_id, rfq_line_id, price, lead_time_days, freight, payment_terms_days, valid_until) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                     ON CONFLICT (rfq_line_id, supplier_id) DO UPDATE SET price=EXCLUDED.price, lead_time_days=EXCLUDED.lead_time_days, freight=EXCLUDED.freight,
                       payment_terms_days=EXCLUDED.payment_terms_days, valid_until=EXCLUDED.valid_until`,
        [rfqId, d.supplier_id, l.rfq_line_id, l.price, l.lead_time_days, l.freight, l.payment_terms_days, l.valid_until ?? null]);
    }
    return { ok: true };
  });
}
/**
 * Weighted quote comparison per line (100 points):
 *  cost 60 — lowest landed unit cost (price + freight ÷ qty) scores 60, others pro-rata
 *  delivery 25 — meets the need date = 25, minus 2 points per day late
 *  performance 15 — supplier OTIF % and quality acceptance % from past receipts (new supplier = 70 %)
 */
export async function getRFQ(org: number, id: number) {
  const r = await one(`SELECT r.*, pr.pr_no, l.code AS location_code, u.name AS created_by_name FROM rfqs r LEFT JOIN purchase_requisitions pr ON pr.id=r.pr_id
                        JOIN locations l ON l.id=r.location_id LEFT JOIN users u ON u.id=r.created_by WHERE r.org_id=$1 AND r.id=$2`, [org, id]);
  if (!r) throw new HttpError(404, 'RFQ not found');
  const suppliers = await query(`SELECT s.id, s.code, s.name, s.status, s.state_code, p.lines_due, p.lines_otif, p.qty_received, p.qty_rejected
                                   FROM rfq_suppliers rs JOIN suppliers s ON s.id=rs.supplier_id LEFT JOIN v_supplier_performance p ON p.supplier_id=s.id WHERE rs.rfq_id=$1 ORDER BY s.name`, [id]);
  const perf = new Map(suppliers.map(x => { const otif = x.lines_due ? x.lines_otif / x.lines_due : 0.7, q = Number(x.qty_received) ? 1 - Number(x.qty_rejected) / Number(x.qty_received) : 0.7;
    return [x.id, { otif: Math.round(otif * 1000) / 10, quality: Math.round(q * 1000) / 10, score: 15 * (0.6 * otif + 0.4 * q) }]; }));
  const lines = await query(`SELECT rl.*, i.code, i.name, i.uom FROM rfq_lines rl JOIN items i ON i.id=rl.item_id WHERE rl.rfq_id=$1 ORDER BY rl.id`, [id]);
  const quotes = await query(`SELECT * FROM quotes WHERE rfq_id=$1`, [id]);
  const today_ = today();
  const comparison = lines.map(l => {
    const qs = quotes.filter(q => q.rfq_line_id === l.id).map(q => ({ ...q, landed: r2(Number(q.price) + Number(q.freight) / Number(l.qty)), eta: addDays(today_, q.lead_time_days) }));
    const minLanded = Math.min(...qs.map(q => q.landed));
    const scored = qs.map(q => { const late = Math.max(0, (Date.parse(q.eta) - Date.parse(r.need_date)) / 86400e3), p = perf.get(q.supplier_id)!;
      const cost = 60 * minLanded / q.landed, deliv = Math.max(0, 25 - 2 * late);
      return { ...q, days_late: late, otif: p.otif, quality: p.quality, score_cost: r2(cost), score_delivery: r2(deliv), score_perf: r2(p.score), score: r2(cost + deliv + p.score) }; })
      .sort((a, b) => b.score - a.score);
    return { ...l, quotes: scored, recommended: scored[0]?.supplier_id ?? null, lowest: scored.length ? scored.reduce((a, b) => (b.landed < a.landed ? b : a)).supplier_id : null };
  });
  const pos = await query(`SELECT id, po_no, status, total, supplier_id FROM purchase_orders WHERE rfq_id=$1`, [id]);
  return { ...r, suppliers: suppliers.map(x => ({ ...x, ...perf.get(x.id) })), comparison, pos };
}
/** Award: one PO per awarded supplier. Choosing anyone but the top-scored quote needs a written justification. */
export async function awardRFQ(s: Session, id: number, d: { awards: { rfq_line_id: number; supplier_id: number }[]; note: string | null }) {
  const view = await getRFQ(s.orgId, id);
  if (view.status !== 'OPEN') throw new HttpError(422, `RFQ is ${view.status}`);
  if (d.awards.length !== view.comparison.length || new Set(d.awards.map(a => a.rfq_line_id)).size !== view.comparison.length) throw new HttpError(422, 'Award every RFQ line exactly once');
  const off: string[] = [];
  for (const a of d.awards) { const l = view.comparison.find((x: any) => x.id === a.rfq_line_id); if (!l) throw new HttpError(422, 'Unknown line');
    if (!l.quotes.some((q: any) => q.supplier_id === a.supplier_id)) throw new HttpError(422, `No quote from that supplier for ${l.code}`);
    if (l.recommended !== a.supplier_id) off.push(l.code); }
  if (off.length && (!d.note || d.note.length < 10)) throw new HttpError(422, `Not awarding the best-scored quote for ${off.join(', ')} — give a justification (10+ characters)`);
  return tx(async c => {
    const bySup = new Map<number, any[]>(); for (const a of d.awards) bySup.set(a.supplier_id, [...(bySup.get(a.supplier_id) ?? []), a]);
    const created: string[] = [];
    for (const [sid, aws] of bySup) {
      const lines = aws.map(a => { const l = view.comparison.find((x: any) => x.id === a.rfq_line_id); const q = l.quotes.find((x: any) => x.supplier_id === sid); return { item_id: l.item_id, qty: Number(l.qty), price: Number(q.price), freight: Number(q.freight), lead: q.lead_time_days, terms: q.payment_terms_days, qid: q.id }; });
      const po = await insertPO(c, s, { supplier_id: sid, location_id: view.location_id, expected_date: addDays(today(), Math.max(...lines.map(l => l.lead))), pr_id: view.pr_id, rfq_id: id,
        freight: lines.reduce((a, l) => a + l.freight, 0), payment_terms_days: lines[0].terms, notes: d.note, lines });
      for (const l of lines) {
        await c.query(`UPDATE quotes SET awarded=TRUE WHERE id=$1`, [l.qid]);
        // keep the approved source list current with the awarded commercial terms
        await c.query(`INSERT INTO supplier_items(supplier_id,item_id,price,lead_time_days,moq) VALUES ($1,$2,$3,$4,1)
                       ON CONFLICT (supplier_id,item_id) DO UPDATE SET price=EXCLUDED.price, lead_time_days=EXCLUDED.lead_time_days`, [sid, l.item_id, l.price, l.lead]);
      }
      created.push(po.po_no);
    }
    await c.query(`UPDATE rfqs SET status='AWARDED', award_note=$2 WHERE id=$1`, [id, d.note]);
    if (view.pr_id) await c.query(`UPDATE purchase_requisitions SET status='ORDERED' WHERE id=$1`, [view.pr_id]);
    return { purchase_orders: created };
  });
}

// ---------------------------------------------------------------- Purchase orders
async function insertPO(c: PoolClient, s: Session, d: any) {
  const { rows: [sup] } = await c.query(`SELECT * FROM suppliers WHERE id=$1 AND org_id=$2`, [d.supplier_id, s.orgId]);
  if (!sup) throw new HttpError(422, 'Unknown supplier');
  if (sup.status === 'BLOCKED') throw new HttpError(422, `${sup.name} is blocked — purchase orders are not allowed`);
  const { rows: [loc] } = await c.query(`SELECT * FROM locations WHERE id=$1 AND org_id=$2`, [d.location_id, s.orgId]);
  if (!loc) throw new HttpError(422, 'Unknown ship-to location');
  if (d.expected_date < today()) throw new HttpError(422, 'Expected delivery date is in the past');
  const intra = sup.state_code === loc.state_code, flags: string[] = [];
  if (sup.status === 'CONDITIONAL') flags.push('Supplier on conditional approval');
  let sub = 0, tax = 0;
  const priced: any[] = [];
  for (const l of d.lines) {
    const { rows: [it] } = await c.query(`SELECT i.*, si.price AS contract, (SELECT pl.price FROM po_lines pl JOIN purchase_orders p ON p.id=pl.po_id
                                             WHERE pl.item_id=i.id AND p.status NOT IN ('CANCELLED','REJECTED','DRAFT') ORDER BY p.id DESC LIMIT 1) AS last_price
                                            FROM items i LEFT JOIN supplier_items si ON si.item_id=i.id AND si.supplier_id=$2 WHERE i.id=$1 AND i.org_id=$3`, [l.item_id, sup.id, s.orgId]);
    if (!it) throw new HttpError(422, 'Unknown item');
    if (it.make_buy === 'MAKE') throw new HttpError(422, `${it.code} is made in-house — raise a production order instead`);
    const ref = it.contract ?? it.last_price;
    if (ref && l.price > Number(ref) * 1.1) flags.push(`${it.code} price ₹${l.price} is ${Math.round((l.price / Number(ref) - 1) * 100)}% above ${it.contract ? 'contract' : 'last PO'} ₹${Number(ref)}`);
    const amt = r2(l.qty * l.price); sub += amt; tax += r2(amt * Number(it.gst_rate) / 100);
    priced.push({ ...l, gst_rate: it.gst_rate });
  }
  const freight = r2(d.freight ?? 0); tax = r2(tax + freight * 0.18);   // freight taxed at 18 %
  const total = r2(sub + freight + tax);
  const { rows: [po] } = await c.query(
    `INSERT INTO purchase_orders(org_id, po_no, supplier_id, location_id, expected_date, tax_type, subtotal, freight, cgst, sgst, igst, total, price_flags, rfq_id, pr_id, payment_terms_days, notes, created_by)
     VALUES ($1, next_no($1,'PO'), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [s.orgId, sup.id, loc.id, d.expected_date, intra ? 'INTRA' : 'INTER', r2(sub), freight, intra ? r2(tax / 2) : 0, intra ? r2(tax - r2(tax / 2)) : 0, intra ? 0 : tax, total,
     flags, d.rfq_id ?? null, d.pr_id ?? null, d.payment_terms_days ?? sup.payment_terms_days, d.notes ?? null, s.uid]);
  for (const l of priced) await c.query(`INSERT INTO po_lines(po_id, item_id, qty, price, gst_rate, planned_order_id) VALUES ($1,$2,$3,$4,$5,$6)`, [po.id, l.item_id, l.qty, l.price, l.gst_rate, l.planned_order_id ?? null]);
  return po;
}
export async function createPO(s: Session, d: any) {
  return tx(async c => {
    if (d.pr_id) { const { rows: [pr] } = await c.query(`SELECT status FROM purchase_requisitions WHERE id=$1 AND org_id=$2 FOR UPDATE`, [d.pr_id, s.orgId]);
      if (!pr || !['APPROVED', 'ORDERED'].includes(pr.status)) throw new HttpError(422, 'The requisition must be approved before ordering');   // ORDERED: split across suppliers
      await c.query(`UPDATE purchase_requisitions SET status='ORDERED' WHERE id=$1`, [d.pr_id]); }
    return insertPO(c, s, d);
  });
}
/**
 * Approval matrix (organisation settings):
 *   ≤ auto limit, approved supplier, no price flags → released immediately (AUTO)
 *   ≤ manager limit → SCM manager · above → director (ADMIN). The creator can never approve their own PO.
 */
export async function submitPO(s: Session, id: number) {
  return tx(async c => {
    const { rows: [po] } = await c.query(`SELECT p.*, o.po_auto_limit, o.po_manager_limit FROM purchase_orders p JOIN organizations o ON o.id=p.org_id WHERE p.id=$1 AND p.org_id=$2 FOR UPDATE OF p`, [id, s.orgId]);
    if (!po) throw new HttpError(404, 'PO not found');
    if (po.status !== 'DRAFT') throw new HttpError(422, `PO is ${po.status}`);
    const total = Number(po.total);
    const level = total <= Number(po.po_auto_limit) && !po.price_flags.length ? 'AUTO' : total <= Number(po.po_manager_limit) ? 'MANAGER' : 'DIRECTOR';
    const { rows: [r] } = await c.query(`UPDATE purchase_orders SET status=$2, approval_level=$3 ${level === 'AUTO' ? ', approved_at=now()' : ''} WHERE id=$1 RETURNING *`,
      [id, level === 'AUTO' ? 'APPROVED' : 'PENDING_APPROVAL', level]);
    return r;
  });
}
export async function approvePO(s: Session, id: number) {
  const po = await one(`SELECT * FROM purchase_orders WHERE id=$1 AND org_id=$2`, [id, s.orgId]);
  if (!po) throw new HttpError(404, 'PO not found');
  if (po.status !== 'PENDING_APPROVAL') throw new HttpError(422, `PO is ${po.status}`);
  if (po.created_by === s.uid) throw new HttpError(403, 'You cannot approve a PO you created');
  if (po.approval_level === 'DIRECTOR' && s.role !== 'ADMIN') throw new HttpError(403, `PO value ₹${Number(po.total).toLocaleString('en-IN')} needs director (ADMIN) approval`);
  return one(`UPDATE purchase_orders SET status='APPROVED', approved_by=$2, approved_at=now() WHERE id=$1 RETURNING *`, [id, s.uid]);
}
export async function rejectPO(s: Session, id: number, reason: string) {
  const r = await one(`UPDATE purchase_orders SET status='REJECTED', reject_reason=$3, approved_by=$4 WHERE id=$1 AND org_id=$2 AND status='PENDING_APPROVAL' RETURNING *`, [id, s.orgId, reason, s.uid]);
  if (!r) throw new HttpError(422, 'Only POs awaiting approval can be rejected');
  return r;
}
export async function cancelPO(s: Session, id: number, reason: string) {
  const po = await one(`SELECT p.*, (SELECT COALESCE(SUM(received_qty),0) FROM po_lines WHERE po_id=p.id) AS recd FROM purchase_orders p WHERE id=$1 AND org_id=$2`, [id, s.orgId]);
  if (!po) throw new HttpError(404, 'PO not found');
  if (Number(po.recd) > 0) throw new HttpError(422, 'Goods have been received — close the PO short instead');
  if (['CANCELLED', 'CLOSED', 'RECEIVED'].includes(po.status)) throw new HttpError(422, `PO is ${po.status}`);
  return one(`UPDATE purchase_orders SET status='CANCELLED', reject_reason=$2 WHERE id=$1 RETURNING *`, [id, reason]);
}
export async function closePO(s: Session, id: number, reason: string) {
  const r = await one(`UPDATE purchase_orders SET status='CLOSED', notes=COALESCE(notes||' · ','')||'Closed short: '||$3 WHERE id=$1 AND org_id=$2 AND status='PARTIAL' RETURNING *`, [id, s.orgId, reason]);
  if (!r) throw new HttpError(422, 'Only partially received POs can be closed short');
  return r;
}
export const listPOs = (org: number, f: { status?: string; supplier_id?: number; location_id?: number }) => query(
  `SELECT p.*, s.name AS supplier, s.code AS supplier_code, l.code AS location_code, u.name AS created_by_name, a.name AS approved_by_name,
          (p.status IN ('APPROVED','PARTIAL') AND p.expected_date < CURRENT_DATE) AS late,
          (SELECT ROUND(100.0*SUM(accepted_qty)/NULLIF(SUM(qty),0)) FROM po_lines WHERE po_id=p.id) AS pct_received
     FROM purchase_orders p JOIN suppliers s ON s.id=p.supplier_id JOIN locations l ON l.id=p.location_id
     LEFT JOIN users u ON u.id=p.created_by LEFT JOIN users a ON a.id=p.approved_by
    WHERE p.org_id=$1 AND ($2::text IS NULL OR ($2='OPEN' AND p.status IN ('DRAFT','PENDING_APPROVAL','APPROVED','PARTIAL')) OR ($2='RECEIVABLE' AND p.status IN ('APPROVED','PARTIAL')) OR p.status::text=$2)
      AND ($3::int IS NULL OR p.supplier_id=$3) AND ($4::int IS NULL OR p.location_id=$4) ORDER BY p.id DESC LIMIT 400`, [org, f.status ?? null, f.supplier_id ?? null, f.location_id ?? null]);
export async function getPO(org: number, id: number) {
  const po = await one(`SELECT p.*, s.name AS supplier, s.code AS supplier_code, s.gstin AS supplier_gstin, s.city AS supplier_city, s.state_code AS supplier_state, s.status AS supplier_status,
                               l.code AS location_code, l.name AS location_name, l.city AS location_city, o.name AS org_name, o.gstin AS org_gstin, o.address AS org_address,
                               u.name AS created_by_name, a.name AS approved_by_name, r.rfq_no, pr.pr_no
                          FROM purchase_orders p JOIN suppliers s ON s.id=p.supplier_id JOIN locations l ON l.id=p.location_id JOIN organizations o ON o.id=p.org_id
                          LEFT JOIN users u ON u.id=p.created_by LEFT JOIN users a ON a.id=p.approved_by LEFT JOIN rfqs r ON r.id=p.rfq_id LEFT JOIN purchase_requisitions pr ON pr.id=p.pr_id
                         WHERE p.org_id=$1 AND p.id=$2`, [org, id]);
  if (!po) throw new HttpError(404, 'PO not found');
  const lines = await query(`SELECT pl.*, i.code, i.name, i.uom, i.hsn FROM po_lines pl JOIN items i ON i.id=pl.item_id WHERE pl.po_id=$1 ORDER BY pl.id`, [id]);
  const grns = await query(`SELECT g.*, u.name AS received_by_name, (SELECT json_agg(json_build_object('code', i.code, 'received', gl.received_qty, 'accepted', gl.accepted_qty, 'rejected', gl.rejected_qty, 'reason', gl.reject_reason))
                               FROM grn_lines gl JOIN po_lines pl ON pl.id=gl.po_line_id JOIN items i ON i.id=pl.item_id WHERE gl.grn_id=g.id) AS lines
                              FROM grns g LEFT JOIN users u ON u.id=g.received_by WHERE g.po_id=$1 ORDER BY g.id`, [id]);
  return { ...po, lines, grns };
}

// ---------------------------------------------------------------- Goods receipt
/** GRN: accepted quantity goes into stock at moving-average cost; over-receipt beyond tolerance is refused */
export async function receiveGRN(s: Session, d: any) {
  return tx(async c => {
    const { rows: [po] } = await c.query(`SELECT p.*, o.grn_tolerance_pct FROM purchase_orders p JOIN organizations o ON o.id=p.org_id WHERE p.id=$1 AND p.org_id=$2 FOR UPDATE OF p`, [d.po_id, s.orgId]);
    if (!po) throw new HttpError(404, 'PO not found');
    if (!['APPROVED', 'PARTIAL'].includes(po.status)) throw new HttpError(422, po.status === 'PENDING_APPROVAL' ? 'PO is not approved yet — goods cannot be received' : `PO is ${po.status}`);
    assertLocation(s, po.location_id);
    const recOn = d.received_on ?? today(); if (recOn > today()) throw new HttpError(422, 'Receipt date cannot be in the future');
    const { rows: [g] } = await c.query(`INSERT INTO grns(org_id, grn_no, po_id, location_id, received_on, supplier_invoice, vehicle_no, remarks, received_by)
                                          VALUES ($1, next_no($1,'GRN'), $2,$3,$4,$5,$6,$7,$8) RETURNING *`, [s.orgId, po.id, po.location_id, recOn, d.supplier_invoice, d.vehicle_no, d.remarks, s.uid]);
    const tol = 1 + Number(po.grn_tolerance_pct) / 100;
    for (const l of d.lines) {
      const { rows: [pl] } = await c.query(`SELECT pl.*, i.code FROM po_lines pl JOIN items i ON i.id=pl.item_id WHERE pl.id=$1 AND pl.po_id=$2 FOR UPDATE OF pl`, [l.po_line_id, po.id]);
      if (!pl) throw new HttpError(422, 'Line does not belong to this PO');
      if (Number(pl.received_qty) + l.received_qty > Number(pl.qty) * tol + 1e-9)
        throw new HttpError(422, `${pl.code}: receiving ${l.received_qty} would exceed ordered ${Number(pl.qty)} + ${po.grn_tolerance_pct}% tolerance (already received ${Number(pl.received_qty)})`);
      const acc = l.received_qty - l.rejected_qty;
      await c.query(`INSERT INTO grn_lines(grn_id, po_line_id, received_qty, accepted_qty, rejected_qty, reject_reason) VALUES ($1,$2,$3,$4,$5,$6)`, [g.id, pl.id, l.received_qty, acc, l.rejected_qty, l.reject_reason]);
      await c.query(`UPDATE po_lines SET received_qty=received_qty+$2, accepted_qty=accepted_qty+$3, rejected_qty=rejected_qty+$4 WHERE id=$1`, [pl.id, l.received_qty, acc, l.rejected_qty]);
      if (acc > 0) {
        // moving average cost across the network (landed: unit price + freight apportioned by value)
        const landed = Number(pl.price) * (1 + (Number(po.subtotal) ? Number(po.freight) / Number(po.subtotal) : 0));
        await c.query(`UPDATE items i SET avg_cost = ROUND(((SELECT COALESCE(SUM(on_hand),0) FROM stock WHERE item_id=i.id) * i.avg_cost + $2::numeric * $3::numeric)
                                                    / NULLIF((SELECT COALESCE(SUM(on_hand),0) FROM stock WHERE item_id=i.id) + $2::numeric, 0), 4) WHERE id=$1`, [pl.item_id, acc, landed]);
        await c.query(`INSERT INTO stock_moves(org_id, item_id, location_id, qty, type, unit_cost, ref_type, ref_id, ref_no, move_date, user_id) VALUES ($1,$2,$3,$4,'GRN',$5,'GRN',$6,$7,$8,$9)`,
          [s.orgId, pl.item_id, po.location_id, acc, landed, g.id, g.grn_no, recOn, s.uid]);
      }
    }
    const { rows: [st] } = await c.query(`SELECT bool_and(accepted_qty >= qty) AS full FROM po_lines WHERE po_id=$1`, [po.id]);
    await c.query(`UPDATE purchase_orders SET status=$2 WHERE id=$1`, [po.id, st.full ? 'RECEIVED' : 'PARTIAL']);
    return { ...g, po_status: st.full ? 'RECEIVED' : 'PARTIAL' };
  });
}
export const listGRNs = (org: number, locationId?: number | null) => query(
  `SELECT g.*, p.po_no, s.name AS supplier, l.code AS location_code, u.name AS received_by_name,
          (SELECT SUM(accepted_qty) FROM grn_lines WHERE grn_id=g.id) AS accepted, (SELECT SUM(rejected_qty) FROM grn_lines WHERE grn_id=g.id) AS rejected
     FROM grns g JOIN purchase_orders p ON p.id=g.po_id JOIN suppliers s ON s.id=p.supplier_id JOIN locations l ON l.id=g.location_id LEFT JOIN users u ON u.id=g.received_by
    WHERE g.org_id=$1 AND ($2::int IS NULL OR g.location_id=$2) ORDER BY g.id DESC LIMIT 300`, [org, locationId ?? null]);

export const listRFQs = (org: number) => query(
  `SELECT r.*, pr.pr_no, l.code AS location_code, (SELECT COUNT(*) FROM rfq_suppliers WHERE rfq_id=r.id) AS invited,
          (SELECT COUNT(DISTINCT supplier_id) FROM quotes WHERE rfq_id=r.id) AS quoted, (SELECT string_agg(i.code, ', ') FROM rfq_lines rl JOIN items i ON i.id=rl.item_id WHERE rl.rfq_id=r.id) AS items
     FROM rfqs r LEFT JOIN purchase_requisitions pr ON pr.id=r.pr_id JOIN locations l ON l.id=r.location_id WHERE r.org_id=$1 ORDER BY r.id DESC LIMIT 200`, [org]);
