import type { Response } from 'express';
import type { ApiMeta } from '@pharmaos/shared';

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

export function created<T>(res: Response, data: T): void {
  ok(res, data, 201);
}

export function paginated<T>(res: Response, data: T[], meta: ApiMeta): void {
  res.status(200).json({ success: true, data, meta });
}

export function noContent(res: Response): void {
  res.status(204).end();
}
