import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole, PLAN, STORE } from '../middleware/auth';
import {
  listMOs,
  createMO,
  getMO,
  releaseMO,
  completeMO,
  cancelMO,
} from '../lib/services/operations';
import { moSchema } from '../lib/validators';

const router = Router();

router.get('/', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const result = await listMOs(s.orgId, status);
  res.json(result);
}));

router.post('/', requireRole(...PLAN), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = moSchema.parse(req.body);
  const result = await createMO(s, parsed);
  res.json(result);
}));

router.get('/:id', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const id = Number(req.params.id);
  const result = await getMO(s.orgId, id);
  res.json(result);
}));

router.post('/:id/release', requireRole(...PLAN), asyncHandler(async (req, res) => {
  const s = req.session!;
  const id = Number(req.params.id);
  const result = await releaseMO(s, id);
  res.json(result);
}));

router.post('/:id/complete', requireRole(...STORE), asyncHandler(async (req, res) => {
  const s = req.session!;
  const id = Number(req.params.id);
  const { qty } = z.object({ qty: z.coerce.number().positive() }).parse(req.body);
  const result = await completeMO(s, id, qty);
  res.json(result);
}));

router.post('/:id/cancel', requireRole(...PLAN), asyncHandler(async (req, res) => {
  const s = req.session!;
  const id = Number(req.params.id);
  const result = await cancelMO(s, id);
  res.json(result);
}));

export default router;
