import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole } from '../middleware/auth';
import { query } from '../lib/db';
import { controlTower } from '../lib/services/reports';

const router = Router();

// --- Control Tower Executive Dashboard ---
router.get('/reports/control-tower', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await controlTower(s.orgId));
}));

// --- Lookup Masters ---
router.get('/lookups', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const [items, locations, suppliers, customers, transporters, vehicles, users] = await Promise.all([
    query(
      `SELECT id, code, name, uom, type, make_buy, sale_price, std_cost, gst_rate, weight_kg 
       FROM items WHERE org_id=$1 AND active ORDER BY code`,
      [s.orgId]
    ),
    query(
      `SELECT id, code, name, type, state_code, supply_from, transit_days 
       FROM locations WHERE org_id=$1 AND active ORDER BY id`,
      [s.orgId]
    ),
    query(
      `SELECT id, code, name, status, state_code 
       FROM suppliers WHERE org_id=$1 ORDER BY name`,
      [s.orgId]
    ),
    query(
      `SELECT id, code, name, city, ship_from 
       FROM customers WHERE org_id=$1 ORDER BY name`,
      [s.orgId]
    ),
    query(
      `SELECT id, name FROM transporters WHERE org_id=$1 ORDER BY name`,
      [s.orgId]
    ),
    query(
      `SELECT id, reg_no, type, capacity_kg, transporter_id 
       FROM vehicles WHERE org_id=$1 ORDER BY reg_no`,
      [s.orgId]
    ),
    query(
      `SELECT u.id, u.name, m.role, m.location_id 
       FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 ORDER BY u.name`,
      [s.orgId]
    ),
  ]);
  res.json({ items, locations, suppliers, customers, transporters, vehicles, users });
}));

// --- Mobile / My Work ---
router.get('/me/work', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const loc = s.locationId ?? null;
  const [trips, receipts, inbound, outbound] = await Promise.all([
    query(
      `SELECT sh.id, sh.shp_no, sh.type, sh.status, sh.planned_date, v.reg_no, 
              (SELECT COUNT(*) FROM shipment_stops WHERE shipment_id=sh.id) AS stops,
              (SELECT COUNT(*) FROM shipment_stops WHERE shipment_id=sh.id AND status<>'PENDING') AS done 
       FROM shipments sh LEFT JOIN vehicles v ON v.id=sh.vehicle_id
       WHERE sh.org_id=$1 AND sh.driver_id=$2 AND sh.status IN ('PLANNED','DISPATCHED') ORDER BY sh.planned_date`,
      [s.orgId, s.uid]
    ),
    query(
      `SELECT p.id, p.po_no, p.expected_date, s.name AS supplier, (p.expected_date < CURRENT_DATE) AS late 
       FROM purchase_orders p JOIN suppliers s ON s.id=p.supplier_id
       WHERE p.org_id=$1 AND p.status IN ('APPROVED','PARTIAL') AND ($2::int IS NULL OR p.location_id=$2) 
       ORDER BY p.expected_date LIMIT 50`,
      [s.orgId, loc]
    ),
    query(
      `SELECT t.id, t.to_no, t.need_date, fl.code AS from_code 
       FROM transfer_orders t JOIN locations fl ON fl.id=t.from_location_id
       WHERE t.org_id=$1 AND t.status='DISPATCHED' AND ($2::int IS NULL OR t.to_location_id=$2) 
       ORDER BY t.need_date`,
      [s.orgId, loc]
    ),
    query(
      `SELECT t.id, t.to_no, t.need_date, t.status, tl.code AS to_code 
       FROM transfer_orders t JOIN locations tl ON tl.id=t.to_location_id
       WHERE t.org_id=$1 AND t.status IN ('DRAFT','RELEASED') AND ($2::int IS NULL OR t.from_location_id=$2) 
       ORDER BY t.need_date`,
      [s.orgId, loc]
    ),
  ]);
  res.json({ trips, receipts, inbound, outbound });
}));

export default router;
