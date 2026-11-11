import { Router } from 'express';
import { query } from '../lib/db';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const rows = await query('SELECT 1 as ok, NOW() as now');
  res.json({
    status: 'ok',
    service: 'chainpilot-backend (Express)',
    timestamp: rows[0].now,
    database: 'connected',
  });
}));

export default router;

