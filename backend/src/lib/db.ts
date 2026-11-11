import dotenv from 'dotenv';
import path from 'path';
import { Pool, PoolClient, QueryResultRow, types } from 'pg';

// Ensure .env is loaded before DB connection
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

types.setTypeParser(1082, v => v);            // DATE  -> 'YYYY-MM-DD'
types.setTypeParser(1700, v => parseFloat(v)); // NUMERIC -> number (money stored as NUMERIC(14,2))
types.setTypeParser(20, v => parseInt(v, 10)); // BIGINT -> number (ids, counts)

const g = globalThis as unknown as { __pgPool?: Pool };
const isSsl =
  process.env.DATABASE_URL?.includes('sslmode=require') ||
  process.env.DATABASE_URL?.includes('neon.tech') ||
  process.env.DATABASE_URL?.includes('aws.') ||
  process.env.DATABASE_URL?.includes('render.com');

export const pool = g.__pgPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  ssl: isSsl ? { rejectUnauthorized: false } : undefined,
});
if (process.env.NODE_ENV !== 'production') g.__pgPool = pool;
// a dropped idle connection (DB restart, failover) must not crash the server; the pool reconnects on next use
pool.on('error', e => console.error('pg pool error (idle client):', e.message));

export async function query<T extends QueryResultRow = any>(sql: string, params: unknown[] = []) {
  return (await pool.query<T>(sql, params)).rows;
}
export async function one<T extends QueryResultRow = any>(sql: string, params: unknown[] = []) {
  return (await query<T>(sql, params))[0] ?? null;
}
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK'); throw e; }
  finally { c.release(); }
}
