import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { HttpError } from './auth';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: err.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '),
    });
  }

  // PostgreSQL error codes
  if (err?.code === '23505') {
    return res.status(409).json({ error: 'Already exists: ' + (err.detail ?? '') });
  }
  if (err?.code === '23514') {
    return res.status(422).json({ error: err.message });
  }
  if (err?.code === '23503') {
    return res.status(422).json({ error: 'Linked record missing or still in use' });
  }

  console.error('[API ERROR]', err);
  return res.status(500).json({ error: err.message || 'Internal server error' });
}

