import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole, MASTER, PLAN, HttpError } from '../middleware/auth';
import { one, query, tx } from '../lib/db';
import { signSession } from '../lib/session';
import {
  items,
  locations,
  suppliers,
  customers,
} from '../lib/crud';
import {
  itemSchema,
  locationSchema,
  supplierSchema,
  customerSchema,
  bomSchema,
  sourceSchema,
  policySchema,
  memberSchema,
} from '../lib/validators';

const router = Router();

// ======================== ITEMS ========================
router.get('/items', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await items.list(s.orgId));
}));

router.post('/items', requireRole(...MASTER), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = itemSchema.parse(req.body);
  res.json(await items.create(s.orgId, parsed));
}));

router.get('/items/:id', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const id = Number(req.params.id);
  const it = await one(`SELECT * FROM items WHERE id=$1 AND org_id=$2`, [id, s.orgId]);
  if (!it) throw new HttpError(404, 'Item not found');

  const [bom, usedIn, sources, stock] = await Promise.all([
    query(
      `SELECT b.*, i.code, i.name, i.uom, i.avg_cost FROM bom_lines b JOIN items i ON i.id=b.component_id WHERE b.parent_id=$1 ORDER BY i.code`,
      [id]
    ),
    query(
      `SELECT b.qty_per, i.id, i.code, i.name FROM bom_lines b JOIN items i ON i.id=b.parent_id WHERE b.component_id=$1`,
      [id]
    ),
    query(
      `SELECT si.*, s.code, s.name, s.status FROM supplier_items si JOIN suppliers s ON s.id=si.supplier_id WHERE si.item_id=$1 ORDER BY si.preferred DESC, si.price`,
      [id]
    ),
    query(
      `SELECT l.id AS location_id, l.code, COALESCE(s.on_hand,0) AS on_hand, COALESCE(s.reserved,0) AS reserved, il.safety_stock, il.reorder_point, il.fixed_ss, il.abc, il.xyz
       FROM item_locations il JOIN locations l ON l.id=il.location_id LEFT JOIN stock s ON s.item_id=il.item_id AND s.location_id=il.location_id WHERE il.item_id=$1 ORDER BY l.id`,
      [id]
    ),
  ]);
  res.json({ ...it, bom, used_in: usedIn, sources, stock });
}));

router.put('/items/:id', requireRole(...MASTER), asyncHandler(async (req, res) => {
  const s = req.session!;
  const id = Number(req.params.id);
  const parsed = (itemSchema as any).innerType().partial().parse(req.body);
  res.json(await items.update(s.orgId, id, parsed));
}));

router.put('/items/:id/bom', requireRole(...MASTER), asyncHandler(async (req, res) => {
  const s = req.session!;
  const id = Number(req.params.id);
  const d = bomSchema.parse(req.body);

  const it = await one(`SELECT * FROM items WHERE id=$1 AND org_id=$2`, [id, s.orgId]);
  if (!it) throw new HttpError(404, 'Item not found');
  if (it.make_buy !== 'MAKE') throw new HttpError(422, 'Only make items have a bill of materials');

  const all = await query(
    `SELECT b.parent_id, b.component_id FROM bom_lines b JOIN items i ON i.id=b.parent_id WHERE i.org_id=$1 AND b.parent_id <> $2`,
    [s.orgId, id]
  );
  const contains = (p: number, target: number, seen = new Set<number>()): boolean =>
    p === target ||
    (!seen.has(p) &&
      (seen.add(p), all.filter(b => b.parent_id === p).some(b => contains(b.component_id, target, seen))));

  for (const l of d.lines) {
    if (contains(l.component_id, id)) throw new HttpError(422, 'Circular bill of materials');
  }

  const result = await tx(async c => {
    await c.query(`DELETE FROM bom_lines WHERE parent_id=$1`, [id]);
    for (const l of d.lines) {
      await c.query(
        `INSERT INTO bom_lines(parent_id, component_id, qty_per, scrap_pct) VALUES ($1,$2,$3,$4)`,
        [id, l.component_id, l.qty_per, l.scrap_pct]
      );
    }
    return { lines: d.lines.length };
  });
  res.json(result);
}));

// ======================== LOCATIONS ========================
router.get('/locations', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await locations.list(s.orgId));
}));

router.post('/locations', requireRole(...MASTER), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = locationSchema.parse(req.body);
  res.json(await locations.create(s.orgId, parsed));
}));

router.get('/locations/:id', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const id = Number(req.params.id);
  const loc = await one(`SELECT * FROM locations WHERE id=$1 AND org_id=$2`, [id, s.orgId]);
  if (!loc) throw new HttpError(404, 'Location not found');
  res.json(loc);
}));

router.put('/locations/:id', requireRole(...MASTER), asyncHandler(async (req, res) => {
  const s = req.session!;
  const id = Number(req.params.id);
  const parsed = (locationSchema as any).innerType().partial().parse(req.body);
  res.json(await locations.update(s.orgId, id, parsed));
}));

// ======================== SUPPLIERS ========================
router.get('/suppliers', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const result = await query(
    `SELECT s.*, 
            COALESCE(p.pos_received, 0) AS pos_received,
            COALESCE(p.lines_due, 0) AS lines_due,
            COALESCE(p.lines_on_time, 0) AS lines_on_time,
            COALESCE(p.lines_in_full, 0) AS lines_in_full,
            COALESCE(p.lines_otif, 0) AS lines_otif,
            COALESCE(p.qty_received, 0) AS qty_received,
            COALESCE(p.qty_rejected, 0) AS qty_rejected,
            COALESCE(p.late_open_pos, 0) AS late_open_pos
     FROM suppliers s
     LEFT JOIN v_supplier_performance p ON p.supplier_id = s.id
     WHERE s.org_id = $1
     ORDER BY s.code`,
    [s.orgId]
  );
  res.json(result);
}));

router.post('/suppliers', requireRole(...MASTER), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = supplierSchema.parse(req.body);
  res.json(await suppliers.create(s.orgId, parsed));
}));

router.get('/suppliers/:id', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const id = Number(req.params.id);
  const sup = await one(`SELECT * FROM suppliers WHERE id=$1 AND org_id=$2`, [id, s.orgId]);
  if (!sup) throw new HttpError(404, 'Supplier not found');
  res.json(sup);
}));

router.put('/suppliers/:id', requireRole(...MASTER), asyncHandler(async (req, res) => {
  const s = req.session!;
  const id = Number(req.params.id);
  const parsed = (supplierSchema as any).innerType().partial().parse(req.body);
  res.json(await suppliers.update(s.orgId, id, parsed));
}));

// ======================== CUSTOMERS ========================
router.get('/customers', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  res.json(await customers.list(s.orgId));
}));

router.post('/customers', requireRole(...MASTER), asyncHandler(async (req, res) => {
  const s = req.session!;
  const parsed = customerSchema.parse(req.body);
  res.json(await customers.create(s.orgId, parsed));
}));

router.get('/customers/:id', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const id = Number(req.params.id);
  const cust = await one(`SELECT * FROM customers WHERE id=$1 AND org_id=$2`, [id, s.orgId]);
  if (!cust) throw new HttpError(404, 'Customer not found');
  res.json(cust);
}));

router.put('/customers/:id', requireRole(...MASTER), asyncHandler(async (req, res) => {
  const s = req.session!;
  const id = Number(req.params.id);
  const parsed = (customerSchema as any).innerType().partial().parse(req.body);
  res.json(await customers.update(s.orgId, id, parsed));
}));

// ======================== MEMBERS ========================
router.get('/members', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const result = await query(
    `SELECT u.id, u.name, u.email, u.phone, m.role, m.location_id, l.code AS location_code 
     FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN locations l ON l.id=m.location_id
     WHERE m.org_id=$1 ORDER BY m.role, u.name`,
    [s.orgId]
  );
  res.json(result);
}));

router.post('/members', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const s = req.session!;
  const d = memberSchema.parse(req.body);
  const result = await tx(async c => {
    let { rows: [u] } = await c.query(`SELECT id FROM users WHERE lower(email)=lower($1)`, [d.email]);
    if (!u) {
      if (!d.name || !d.password) throw new HttpError(400, 'New user needs a name and password (8+ chars)');
      ({ rows: [u] } = await c.query(
        `INSERT INTO users(name,email,password_hash,last_org_id) VALUES ($1,lower($2),$3,$4) RETURNING id`,
        [d.name, d.email, await bcrypt.hash(d.password, 10), s.orgId]
      ));
    }
    await c.query(
      `INSERT INTO memberships(org_id,user_id,role,location_id) VALUES ($1,$2,$3,$4) 
       ON CONFLICT (org_id,user_id) DO UPDATE SET role=EXCLUDED.role, location_id=EXCLUDED.location_id`,
      [s.orgId, u.id, d.role, d.location_id]
    );
    return { ok: true };
  });
  res.json(result);
}));

router.put('/members/:userId', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const s = req.session!;
  const userId = Number(req.params.userId);
  if (!userId) throw new HttpError(400, 'Invalid user ID');

  const { name, role, location_id, password } = req.body;
  if (!role) throw new HttpError(400, 'Role is required');

  const result = await tx(async c => {
    // 1. Verify user belongs to this organization
    const { rows: [m] } = await c.query(
      `SELECT * FROM memberships WHERE org_id=$1 AND user_id=$2`,
      [s.orgId, userId]
    );
    if (!m) throw new HttpError(404, 'Member not found in this organization');

    // 2. Update membership role & location
    await c.query(
      `UPDATE memberships SET role=$3, location_id=$4 WHERE org_id=$1 AND user_id=$2`,
      [s.orgId, userId, role, location_id ?? null]
    );

    // 3. Update user name if provided
    if (name && typeof name === 'string' && name.trim()) {
      await c.query(`UPDATE users SET name=$2 WHERE id=$1`, [userId, name.trim()]);
    }

    // 4. Update password if provided
    if (password && typeof password === 'string' && password.trim().length >= 8) {
      const hash = await bcrypt.hash(password.trim(), 10);
      await c.query(`UPDATE users SET password_hash=$2 WHERE id=$1`, [userId, hash]);
    }

    return { ok: true };
  });

  res.json(result);
}));

router.delete('/members/:userId', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const s = req.session!;
  const userId = Number(req.params.userId);
  if (!userId) throw new HttpError(400, 'Invalid user ID');
  if (userId === s.uid) {
    throw new HttpError(400, 'You cannot remove your own account from the organization');
  }

  // Remove membership from this organization
  const del = await one(
    `DELETE FROM memberships WHERE org_id=$1 AND user_id=$2 RETURNING user_id`,
    [s.orgId, userId]
  );
  if (!del) throw new HttpError(404, 'Member not found in this organization');

  res.json({ ok: true });
}));

// ======================== POLICIES ========================
router.put('/policies', requireRole(...PLAN), asyncHandler(async (req, res) => {
  const s = req.session!;
  const d = policySchema.parse(req.body);
  const r = await one(
    `UPDATE item_locations il SET safety_stock=$3, fixed_ss=$4 
     FROM items i WHERE il.item_id=i.id AND i.org_id=$5 AND il.item_id=$1 AND il.location_id=$2 RETURNING il.*`,
    [d.item_id, d.location_id, d.safety_stock, d.fixed_ss, s.orgId]
  );
  if (!r) throw new HttpError(404, 'Not a stocking point');
  res.json(r);
}));

// ======================== SOURCES ========================
router.post('/sources', requireRole(...MASTER), asyncHandler(async (req, res) => {
  const s = req.session!;
  const d = sourceSchema.parse(req.body);
  const ok = await one(
    `SELECT 1 FROM suppliers su, items i WHERE su.id=$1 AND i.id=$2 AND su.org_id=$3 AND i.org_id=$3`,
    [d.supplier_id, d.item_id, s.orgId]
  );
  if (!ok) throw new HttpError(422, 'Unknown supplier or item');

  const result = await tx(async c => {
    if (d.preferred) {
      await c.query(`UPDATE supplier_items SET preferred=FALSE WHERE item_id=$1`, [d.item_id]);
    }
    const resRow = await c.query(
      `INSERT INTO supplier_items VALUES ($1,$2,$3,$4,$5,$6) 
       ON CONFLICT (supplier_id,item_id) DO UPDATE SET price=EXCLUDED.price, lead_time_days=EXCLUDED.lead_time_days, moq=EXCLUDED.moq, preferred=EXCLUDED.preferred RETURNING *`,
      [d.supplier_id, d.item_id, d.price, d.lead_time_days, d.moq, d.preferred]
    );
    return resRow.rows[0];
  });
  res.json(result);
}));

// ======================== ORGANIZATIONS (MULTI-TENANCY) ========================
router.get('/organizations', requireRole(), asyncHandler(async (req, res) => {
  const s = req.session!;
  const orgs = await query(
    `SELECT o.*, m.role FROM memberships m JOIN organizations o ON o.id=m.org_id WHERE m.user_id=$1 ORDER BY o.name`,
    [s.uid]
  );
  res.json(orgs);
}));

router.post('/organizations', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const s = req.session!;
  const schema = z.object({
    name: z.string().trim().min(2, 'Company name is required'),
    gstin: z.string().trim().toUpperCase().optional().nullable(),
    state_code: z.string().trim().length(2).optional().nullable(),
    address: z.string().trim().optional().nullable(),
  });
  const data = schema.parse(req.body);

  const result = await tx(async (c) => {
    // 1. Create Organization
    const { rows: [org] } = await c.query(
      `INSERT INTO organizations(name, gstin, state_code, address) VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.name, data.gstin || null, data.state_code || null, data.address || null]
    );

    // 2. Add current Admin as ADMIN of the new Organization
    await c.query(
      `INSERT INTO memberships(org_id, user_id, role, location_id) VALUES ($1, $2, 'ADMIN', NULL)`,
      [org.id, s.uid]
    );

    // 3. Update user's last_org_id to newly created org
    await c.query(`UPDATE users SET last_org_id=$1 WHERE id=$2`, [org.id, s.uid]);

    return org;
  });

  // 4. Sign a new JWT session for the new organization
  const token = await signSession({
    ...s,
    orgId: result.id,
    role: 'ADMIN',
    locationId: null,
  });

  res.json({ ok: true, org: result, token });
}));

export default router;

