import type { RequestHandler } from 'express';
import { ValidationError } from '@/lib/errors';

/**
 * Rejects request bodies/queries containing MongoDB operator-like keys ($gt, $where) or
 * dotted keys, which could be used for operator injection. zod validation strips unknown
 * keys too, but this runs first as defence in depth and covers nested objects.
 */
function hasDangerousKeys(value: unknown, depth = 0): boolean {
  if (depth > 20) return true;
  if (Array.isArray(value)) return value.some((v) => hasDangerousKeys(v, depth + 1));
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith('$') || k.includes('.') || k === '__proto__' || k === 'constructor') return true;
      if (hasDangerousKeys(v, depth + 1)) return true;
    }
  }
  return false;
}

export const sanitizeRequest: RequestHandler = (req, _res, next) => {
  if (hasDangerousKeys(req.body) || hasDangerousKeys(req.query) || hasDangerousKeys(req.params)) {
    return next(new ValidationError('Request contains invalid characters in field names'));
  }
  next();
};
