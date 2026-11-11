import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, num } from '../lib/asyncHandler';
import { requireRole, PLAN, BUY, STORE, APPROVE } from '../middleware/auth';
import {
  listPRs,
  createPR,
  getPR,
  approvePR,
  rejectPR,
  listRFQs,
  createRFQ,
  getRFQ,
  awardRFQ,
  submitQuote,
  listPOs,
  createPO,
  getPO,
  submitPO,
  approvePO,
  rejectPO,
  closePO,
  cancelPO,
  listGRNs,
  receiveGRN,
} from '../lib/services/procurement';
import {
  prSchema,
  rfqSchema,
  poSchema,
  grnSchema,
  quoteSchema,
  awardSchema,
} from '../lib/validators';

const router = Router();

// --- Purchase Requisitions (PRs) ---
router.get('/prs', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json(await listPRs(s.orgId, status));
}));

router.post('/prs', requireRole(...new Set([...PLAN, ...BUY, ...STORE])), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = prSchema.parse(req.body);
  res.json(await createPR(s, parsed));
}));

router.get('/prs/:id', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await getPR(s.orgId, Number(req.params.id)));
}));

router.post('/prs/:id/approve', requireRole(...APPROVE), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await approvePR(s, Number(req.params.id)));
}));

router.post('/prs/:id/reject', requireRole(...APPROVE), asyncHandler(async (req, res) => {
  const s = req.session!;
  const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
  res.json(await rejectPR(s, Number(req.params.id), reason));
}));

// --- Requests for Quotation (RFQs) ---
router.get('/rfqs', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await listRFQs(s.orgId));
}));

router.post('/rfqs', requireRole(...BUY), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = rfqSchema.parse(req.body);
  res.json(await createRFQ(s, parsed as any));
}));

router.get('/rfqs/:id', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await getRFQ(s.orgId, Number(req.params.id)));
}));

router.post('/rfqs/:id/award', requireRole(...BUY), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = awardSchema.parse(req.body);
  res.json(await awardRFQ(s, Number(req.params.id), parsed as any));
}));

router.post('/rfqs/:id/quotes', requireRole(...BUY), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = quoteSchema.parse(req.body);
  res.json(await submitQuote(s, Number(req.params.id), parsed));
}));

// --- Purchase Orders (POs) ---
router.get('/pos', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const { status, supplier_id, location_id } = req.query;
  const locId = location_id
    ? Number(location_id)
    : s.role === 'WAREHOUSE' && s.locationId
    ? s.locationId
    : undefined;
  res.json(
    await listPOs(s.orgId, {
      status: typeof status === 'string' ? status : undefined,
      supplier_id: num(supplier_id),
      location_id: locId,
    })
  );
}));

router.post('/pos', requireRole(...BUY), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = poSchema.parse(req.body);
  res.json(await createPO(s, parsed));
}));

router.get('/pos/:id', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await getPO(s.orgId, Number(req.params.id)));
}));

router.post('/pos/:id/submit', requireRole(...BUY), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await submitPO(s, Number(req.params.id)));
}));

router.post('/pos/:id/approve', requireRole(...APPROVE), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await approvePO(s, Number(req.params.id)));
}));

router.post('/pos/:id/reject', requireRole(...APPROVE), asyncHandler(async (req, res) => {
  const s = req.session!;
  const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
  res.json(await rejectPO(s, Number(req.params.id), reason));
}));

router.post('/pos/:id/close', requireRole(...BUY), asyncHandler(async (req, res) => {
  const s = req.session!;
  const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
  res.json(await closePO(s, Number(req.params.id), reason));
}));

router.post('/pos/:id/cancel', requireRole(...BUY), asyncHandler(async (req, res) => {
  const s = req.session!;
  const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
  res.json(await cancelPO(s, Number(req.params.id), reason));
}));

// --- Goods Receipt Notes (GRNs) ---
router.get('/grns', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await listGRNs(s.orgId, s.role === 'WAREHOUSE' ? s.locationId : null));
}));

router.post('/grns', requireRole(...STORE), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = grnSchema.parse(req.body);
  res.json(await receiveGRN(s, parsed));
}));

export default router;
