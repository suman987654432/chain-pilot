import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole, PLAN } from '../middleware/auth';
import {
  latestPlan,
  runPlan,
  convertPlanned,
  dismissPlanned,
  planGrid,
} from '../lib/services/planning';
import { convertSchema } from '../lib/validators';

const router = Router();

router.get('/', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const result = await latestPlan(s.orgId);
  res.json(result);
}));

router.post('/', requireRole(...PLAN), asyncHandler(async (req, res) => {
  const s = req.session!;
  const result = await runPlan(s.orgId, s.uid);
  res.json(result);
}));

router.get('/grid', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const item_id = Number(req.query.item_id);
  const location_id = Number(req.query.location_id);
  const result = await planGrid(s.orgId, item_id, location_id);
  res.json(result);
}));

router.post('/convert', requireRole(...PLAN), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = convertSchema.parse(req.body);
  const result = await convertPlanned(s, parsed.ids);
  res.json(result);
}));

router.post('/dismiss', requireRole(...PLAN), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = convertSchema.parse(req.body);
  const result = await dismissPlanned(s.orgId, parsed.ids);
  res.json(result);
}));

export default router;
