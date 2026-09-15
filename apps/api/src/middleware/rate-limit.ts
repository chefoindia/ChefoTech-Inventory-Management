import { rateLimit, type Options } from 'express-rate-limit';
import { isTest } from '@/config/env';
import { RateLimitError } from '@/lib/errors';

function make(opts: Partial<Options>) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => isTest,
    handler: (_req, _res, next) => next(new RateLimitError()),
    ...opts,
  });
}

/** Global ceiling per IP. */
export const globalRateLimit = make({ windowMs: 60_000, limit: 600 });

/** Auth endpoints: brute-force protection per IP. */
export const authRateLimit = make({ windowMs: 15 * 60_000, limit: 30 });

/** Heavier endpoints (PDF, email, exports). */
export const heavyRateLimit = make({ windowMs: 60_000, limit: 30 });
