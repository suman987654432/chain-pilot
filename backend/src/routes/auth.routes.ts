import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, query } from '../lib/db';
import { COOKIE, signSession } from '../lib/session';
import { asyncHandler } from '../lib/asyncHandler';
import { HttpError, requireRole } from '../middleware/auth';

const router = Router();

router.post('/login', asyncHandler(async (req, res) => {
  const p = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!p.success) throw new HttpError(400, 'Email and password required');

  const u = await one(`SELECT * FROM users WHERE lower(email)=lower($1) AND active`, [p.data.email]);
  if (!u || !(await bcrypt.compare(p.data.password, u.password_hash))) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const orgs = await query(
    `SELECT o.id, o.name, m.role FROM memberships m JOIN organizations o ON o.id=m.org_id WHERE m.user_id=$1 ORDER BY o.name`,
    [u.id]
  );
  if (!orgs.length) throw new HttpError(403, 'No organisation access');

  const o = orgs.find(x => x.id === u.last_org_id) ?? orgs[0];
  const token = await signSession({ uid: u.id, name: u.name, email: u.email, orgId: o.id, role: o.role });

  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 86400 * 1000,
  });

  res.json({ token, user: { id: u.id, name: u.name, email: u.email }, org: o, orgs });
}));

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const orgs = await query(
    `SELECT o.id, o.name, m.role FROM memberships m JOIN organizations o ON o.id=m.org_id WHERE m.user_id=$1`,
    [s.uid]
  );
  const loc = s.locationId ? await one(`SELECT id, code, name FROM locations WHERE id=$1`, [s.locationId]) : null;
  res.json({
    user: { id: s.uid, name: s.name, email: s.email },
    role: s.role,
    location: loc,
    org: orgs.find(o => o.id === s.orgId),
    orgs,
  });
}));

router.post('/switch', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const { org_id } = z.object({ org_id: z.coerce.number() }).parse(req.body);

  const m = await one(`SELECT role FROM memberships WHERE org_id=$1 AND user_id=$2`, [org_id, s.uid]);
  if (!m) throw new HttpError(403, 'No access');

  await one(`UPDATE users SET last_org_id=$1 WHERE id=$2`, [org_id, s.uid]);
  const token = await signSession({ ...s, orgId: org_id, role: m.role });

  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 86400 * 1000,
  });

  res.json({ token, role: m.role });
}));

export default router;

