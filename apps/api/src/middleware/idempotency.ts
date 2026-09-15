import type { RequestHandler } from 'express';
import { sha256 } from '@/lib/crypto';
import { AppError, ConflictError } from '@/lib/errors';
import { IdempotencyKeyModel } from '@/models/idempotency-key.model';

const KEY_FORMAT = /^[A-Za-z0-9-_]{8,128}$/;

/**
 * Idempotent POSTs. When `Idempotency-Key` is present:
 *  - first call reserves the key (unique index) and, after the handler responds, stores the response;
 *  - a retry with the same key + same body replays the stored response;
 *  - the same key with a different body is rejected (IDEMPOTENCY_MISMATCH);
 *  - a retry while the first call is still in progress gets 409.
 * Use `required: true` for endpoints that create financial or stock documents.
 */
export function idempotent(options: { required?: boolean } = {}): RequestHandler {
  return async (req, res, next) => {
    try {
      const key = req.header('idempotency-key');
      const ctx = req.ctx;
      if (!key) {
        if (options.required) throw new AppError('VALIDATION_ERROR', 'Idempotency-Key header is required', 400);
        return next();
      }
      if (!ctx) return next();
      if (!KEY_FORMAT.test(key)) throw new AppError('VALIDATION_ERROR', 'Invalid Idempotency-Key format', 400);

      const requestHash = sha256(`${req.method}:${req.originalUrl}:${JSON.stringify(req.body ?? {})}`);

      const existing = await IdempotencyKeyModel.findOne({ organizationId: ctx.organizationId, key }).lean();
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new AppError('IDEMPOTENCY_MISMATCH', 'This Idempotency-Key was already used with a different request', 422);
        }
        if (existing.status === 'in_progress') {
          throw new ConflictError('A request with this Idempotency-Key is still being processed');
        }
        res.setHeader('Idempotent-Replayed', 'true');
        res.status(existing.statusCode ?? 200).json(existing.responseBody);
        return;
      }

      try {
        await IdempotencyKeyModel.create({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          key,
          method: req.method,
          path: req.originalUrl,
          requestHash,
        });
      } catch (err) {
        // Lost a race with a concurrent identical request.
        if ((err as { code?: number }).code === 11000) {
          throw new ConflictError('A request with this Idempotency-Key is still being processed');
        }
        throw err;
      }

      req.idempotencyKey = key;
      const originalJson = res.json.bind(res);
      res.json = ((payload: unknown) => {
        const statusCode = res.statusCode;
        if (statusCode < 500) {
          IdempotencyKeyModel.updateOne(
            { organizationId: ctx.organizationId, key },
            { $set: { status: 'completed', statusCode, responseBody: payload } },
          ).catch(() => undefined);
        } else {
          // Allow the client to retry a server failure with the same key.
          IdempotencyKeyModel.deleteOne({ organizationId: ctx.organizationId, key }).catch(() => undefined);
        }
        return originalJson(payload);
      }) as typeof res.json;

      next();
    } catch (err) {
      next(err);
    }
  };
}
