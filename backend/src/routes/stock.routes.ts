import { Router } from 'express';
import { asyncHandler, num } from '../lib/asyncHandler';
import { requireRole, STORE } from '../middleware/auth';
import { stockView, moves, adjustStock } from '../lib/services/operations';
import { adjustSchema } from '../lib/validators';

const router = Router();

router.get('/', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const { location_id, q, type, health } = req.query;
  const result = await stockView(s.orgId, {
    location_id: num(location_id),
    q: typeof q === 'string' ? q : undefined,
    type: typeof type === 'string' ? type : undefined,
    health: typeof health === 'string' ? health : undefined,
  });
  res.json(result);
}));

router.get('/moves', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const { item_id, location_id } = req.query;
  const result = await moves(s.orgId, Number(item_id), num(location_id));
  res.json(result);
}));

router.post('/adjust', requireRole(...STORE), asyncHandler(async (req, res) => {
  const s = req.session!;
  const payload = adjustSchema.parse(req.body);
  const result = await adjustStock(s, payload);
  res.json(result);
}));

export default router;
