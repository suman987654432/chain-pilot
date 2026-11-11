import { Router } from 'express';
import { asyncHandler, num } from '../lib/asyncHandler';
import { requireRole, PLAN } from '../middleware/auth';
import {
  forecastTable,
  runForecast,
  importHistory,
  demandDetail,
  setOverride,
} from '../lib/services/demand';
import { historySchema, overrideSchema } from '../lib/validators';

const router = Router();

router.get('/forecast', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const location_id = num(req.query.location_id);
  const result = await forecastTable(s.orgId, location_id);
  res.json(result);
}));

router.post('/forecast', requireRole(...PLAN), asyncHandler(async (req, res) => {
  const s = req.session!;
  const result = await runForecast(s.orgId);
  res.json(result);
}));

router.post('/history', requireRole(...PLAN), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = historySchema.parse(req.body);
  const result = await importHistory(s.orgId, parsed.rows as any);
  res.json(result);
}));

router.get('/detail', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const item_id = Number(req.query.item_id);
  const location_id = Number(req.query.location_id);
  const result = await demandDetail(s.orgId, item_id, location_id);
  res.json(result);
}));

router.post('/override', requireRole(...PLAN), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = overrideSchema.parse(req.body);
  const result = await setOverride(s.orgId, s.uid, parsed as any);
  res.json(result);
}));

export default router;
