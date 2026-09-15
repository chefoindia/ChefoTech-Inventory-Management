import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ValidationError } from '@/lib/errors';

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Validated + typed inputs. Controllers read from here, never from raw req.body. */
    valid: { body: unknown; query: unknown; params: unknown };
  }
}

/**
 * Validates and replaces req.valid.{body,query,params} with parsed values.
 * Unknown keys are stripped by zod's default object behaviour.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    req.valid = req.valid ?? { body: undefined, query: undefined, params: undefined };
    const details: { path: string; message: string }[] = [];

    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (result.success) {
        req.valid[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({
            path: [part, ...issue.path.map(String)].join('.'),
            message: issue.message,
          });
        }
      }
    }

    if (details.length) return next(new ValidationError('Please check the highlighted fields', details));
    next();
  };
}

export function body<T>(req: { valid: { body: unknown } }): T {
  return req.valid.body as T;
}
export function query<T>(req: { valid: { query: unknown } }): T {
  return req.valid.query as T;
}
export function params<T>(req: { valid: { params: unknown } }): T {
  return req.valid.params as T;
}
