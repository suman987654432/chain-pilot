// Edge-safe JWT helpers — web cookie or mobile Bearer token
import { SignJWT, jwtVerify } from 'jose';
export type Role = 'ADMIN' | 'MANAGER' | 'PLANNER' | 'BUYER' | 'WAREHOUSE' | 'LOGISTICS' | 'DRIVER' | 'VIEWER';
export type Session = { uid: number; name: string; email: string; orgId: number; role: Role; locationId?: number | null };
export const COOKIE = 'cp_session';
const secret = () => new TextEncoder().encode(process.env.JWT_SECRET || 'dev-only-secret-change-me-please-32ch');
export const signSession = (s: Session) => new SignJWT({ ...s }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(secret());
export async function verifySession(token?: string | null): Promise<Session | null> {
  if (!token) return null;
  try { return (await jwtVerify(token, secret())).payload as unknown as Session; } catch { return null; }
}
export const tokenFrom = (auth: string | null, cookie?: string) => (auth?.startsWith('Bearer ') ? auth.slice(7) : cookie);
