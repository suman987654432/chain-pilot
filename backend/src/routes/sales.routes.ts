import { Router } from 'express';
import { asyncHandler, num } from '../lib/asyncHandler';
import { requireRole, SELL } from '../middleware/auth';
import {
  listSOs,
  createSO,
  getSO,
  allocateSO,
  cancelSO,
  atp,
} from '../lib/services/operations';
import { soSchema } from '../lib/validators';

const router = Router();

// --- Sales Orders (SOs) ---
router.get('/sos', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const { status, location_id } = req.query;
  res.json(
    await listSOs(s.orgId, {
      status: typeof status === 'string' ? status : undefined,
      location_id: num(location_id),
    })
  );
}));

router.post('/sos', requireRole(...SELL), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = soSchema.parse(req.body);
  res.json(await createSO(s, parsed));
}));

router.get('/sos/:id', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await getSO(s.orgId, Number(req.params.id)));
}));

router.post('/sos/:id/allocate', requireRole(...SELL), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await allocateSO(s, Number(req.params.id)));
}));

router.post('/sos/:id/cancel', requireRole(...SELL), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await cancelSO(s, Number(req.params.id)));
}));

// --- Available-to-Promise (ATP) ---
router.get('/atp', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const itemId = Number(req.query.item_id);
  const locationId = Number(req.query.location_id);
  const qty = Number(req.query.qty ?? 1);
  res.json(await atp(s.orgId, itemId, locationId, qty));
}));

export default router;
