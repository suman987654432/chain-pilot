import { Router } from 'express';
import { asyncHandler, num } from '../lib/asyncHandler';
import { requireRole, PLAN, STORE, SHIP } from '../middleware/auth';
import {
  listTOs,
  createTO,
  getTO,
  releaseTO,
  shipTransfer,
  receiveTransfer,
} from '../lib/services/operations';
import {
  toSchema,
  shipTransferSchema,
  receiveTransferSchema,
} from '../lib/validators';

const router = Router();

router.get('/', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const { status, location_id } = req.query;
  const locId = location_id
    ? Number(location_id)
    : s.role === 'WAREHOUSE' && s.locationId
    ? s.locationId
    : undefined;
  res.json(
    await listTOs(s.orgId, {
      status: typeof status === 'string' ? status : undefined,
      location_id: locId,
    })
  );
}));

router.post('/', requireRole(...new Set([...PLAN, ...STORE])), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = toSchema.parse(req.body);
  res.json(await createTO(s, parsed));
}));

router.get('/:id', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await getTO(s.orgId, Number(req.params.id)));
}));

router.post('/:id/release', requireRole(...new Set([...PLAN, ...STORE])), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await releaseTO(s, Number(req.params.id)));
}));

router.post('/:id/ship', requireRole(...new Set([...SHIP, ...STORE])), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = shipTransferSchema.parse(req.body);
  res.json(await shipTransfer(s, Number(req.params.id), parsed));
}));

router.post('/:id/receive', requireRole(...STORE), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = receiveTransferSchema.parse(req.body);
  res.json(await receiveTransfer(s, Number(req.params.id), parsed));
}));

export default router;
