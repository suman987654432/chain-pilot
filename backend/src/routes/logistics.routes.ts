import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole, SHIP, STORE, MASTER } from '../middleware/auth';
import {
  listShipments,
  createShipment,
  getShipment,
  dispatchShipment,
  deliverStop,
  cancelShipment,
} from '../lib/services/operations';
import { transporters, vehicles } from '../lib/crud';
import {
  shipmentSchema,
  dispatchSchema,
  podSchema,
  transporterSchema,
  vehicleSchema,
} from '../lib/validators';

const router = Router();

// --- Shipments ---
router.get('/shipments', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const driver_id = s.role === 'DRIVER' ? s.uid : undefined;
  res.json(await listShipments(s.orgId, { status, driver_id }));
}));

router.post('/shipments', requireRole(...SHIP), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = shipmentSchema.parse(req.body);
  res.json(await createShipment(s, parsed));
}));

router.get('/shipments/:id', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await getShipment(s.orgId, Number(req.params.id), s));
}));

router.post('/shipments/:id/dispatch', requireRole(...new Set([...SHIP, ...STORE])), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = dispatchSchema.parse(req.body || {});
  res.json(await dispatchShipment(s, Number(req.params.id), parsed.eway_bill_no));
}));

router.post('/shipments/:id/stops/:stopId/deliver', requireRole(...SHIP, 'DRIVER'), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = podSchema.parse(req.body);
  res.json(await deliverStop(s, Number(req.params.id), Number(req.params.stopId), parsed));
}));

router.post('/shipments/:id/cancel', requireRole(...SHIP), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await cancelShipment(s, Number(req.params.id)));
}));

// --- Transporters ---
router.get('/transporters', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await transporters.list(s.orgId));
}));

router.post('/transporters', requireRole(...MASTER, ...SHIP), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = transporterSchema.parse(req.body);
  res.json(await transporters.create(s.orgId, parsed));
}));

router.put('/transporters/:id', requireRole(...MASTER, ...SHIP), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = transporterSchema.partial().parse(req.body);
  res.json(await transporters.update(s.orgId, Number(req.params.id), parsed));
}));

// --- Vehicles ---
router.get('/vehicles', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await vehicles.list(s.orgId));
}));

router.post('/vehicles', requireRole(...MASTER, ...SHIP), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = vehicleSchema.parse(req.body);
  res.json(await vehicles.create(s.orgId, parsed));
}));

router.put('/vehicles/:id', requireRole(...MASTER, ...SHIP), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = vehicleSchema.partial().parse(req.body);
  res.json(await vehicles.update(s.orgId, Number(req.params.id), parsed));
}));

export default router;
