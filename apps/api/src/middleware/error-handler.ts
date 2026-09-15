import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MongooseError } from 'mongoose';
import { isAppError, NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { isProd } from '@/config/env';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new NotFoundError('Route'));
};

interface MongoServerErrorLike {
  code?: number;
  keyValue?: Record<string, unknown>;
}

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const requestId = req.requestId;

  if (isAppError(err)) {
    if (err.statusCode >= 500) logger.error({ err, requestId }, err.message);
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.expose ? err.message : 'Something went wrong',
        ...(err.details ? { details: err.details } : {}),
      },
      requestId,
    });
    return;
  }

  // Duplicate key from a unique index → 409 with the offending field.
  const mongoErr = err as MongoServerErrorLike;
  if (mongoErr?.code === 11000) {
    const fields = Object.keys(mongoErr.keyValue ?? {}).filter((k) => k !== 'organizationId');
    res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: fields.length ? `A record with the same ${fields.join(', ')} already exists` : 'Duplicate record',
        details: fields.map((f) => ({ path: f, message: 'Already exists' })),
      },
      requestId,
    });
    return;
  }

  if (err instanceof MongooseError && err.name === 'CastError') {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: isProd ? 'Invalid identifier' : `Invalid identifier: ${(err as Error).message}` },
      requestId,
    });
    return;
  }

  // body-parser errors
  const anyErr = err as { type?: string; status?: number; message?: string };
  if (anyErr?.type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON body' },
      requestId,
    });
    return;
  }
  if (anyErr?.type === 'entity.too.large') {
    res.status(413).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Request body too large' },
      requestId,
    });
    return;
  }
  if (anyErr?.message === 'Origin not allowed') {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Origin not allowed' }, requestId });
    return;
  }

  logger.error({ err, requestId, url: req.originalUrl }, 'unhandled error');
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL',
      message: isProd ? 'Something went wrong' : (anyErr?.message ?? 'Something went wrong'),
    },
    requestId,
  });
};
