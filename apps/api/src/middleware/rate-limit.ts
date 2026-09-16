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
export const authRateLimit = make({ windowMs: 15 * 60_000, limit: 60 });

/** Token refresh happens on every page load for every signed-in user behind the same shop IP, so it gets its own, looser budget. */
export const refreshRateLimit = make({ windowMs: 15 * 60_000, limit: 600 });

/** Heavier endpoints (PDF, email, exports). */
export const heavyRateLimit = make({ windowMs: 60_000, limit: 30 });

/** Public website forms: a handful per hour per IP is plenty for real visitors. */
export const leadRateLimit = make({ windowMs: 60 * 60_000, limit: 8 });
