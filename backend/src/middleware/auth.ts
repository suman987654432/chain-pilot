import { Request, Response, NextFunction } from 'express';
import { COOKIE, Role, Session, tokenFrom, verifySession } from '../lib/session';
import { one, query } from '../lib/db';

export type { Session } from '../lib/session';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

declare global {
  namespace Express {
    interface Request {
      session?: Session;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.[COOKIE];
    const token = tokenFrom(authHeader || null, cookieToken);
    
    if (token) {
      const s = await verifySession(token);
      if (s) {
        const m = await one(
          `SELECT m.role, m.location_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 AND m.user_id=$2 AND u.active`,
          [s.orgId, s.uid]
        );
        if (m) {
          req.session = { ...s, role: m.role, locationId: m.location_id };
        }
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session) {
      return next(new HttpError(401, 'Not authenticated'));
    }
    if (roles.length && !roles.includes(req.session.role)) {
      return next(new HttpError(403, 'Your role cannot do this'));
    }
    next();
  };
}

export const MASTER: Role[] = ['ADMIN', 'MANAGER'];
export const APPROVE: Role[] = ['ADMIN', 'MANAGER'];
export const PLAN: Role[] = ['ADMIN', 'MANAGER', 'PLANNER'];
export const BUY: Role[] = ['ADMIN', 'MANAGER', 'BUYER'];
export const STORE: Role[] = ['ADMIN', 'MANAGER', 'WAREHOUSE'];
export const SHIP: Role[] = ['ADMIN', 'MANAGER', 'LOGISTICS'];
export const SELL: Role[] = ['ADMIN', 'MANAGER', 'PLANNER', 'LOGISTICS'];

export function assertLocation(s: Session, locationId: number) {
  if (s.role === 'WAREHOUSE' && s.locationId && s.locationId !== locationId) {
    throw new HttpError(403, 'You can only transact at your own location');
  }
}

export async function audit(
  org: number,
  user: number | null,
  action: string,
  entity: string,
  id: unknown,
  detail?: unknown
) {
  await query(
    `INSERT INTO audit_log(org_id,user_id,action,entity,entity_id,detail) VALUES ($1,$2,$3,$4,$5,$6)`,
    [org, user, action, entity, String(id ?? ''), detail ? JSON.stringify(detail) : null]
  );
}

