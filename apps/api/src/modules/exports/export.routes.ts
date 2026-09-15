import { Router } from 'express';
import { z } from 'zod';
import { exportQuerySchema, EXPORT_ENTITIES, type ExportQuery } from '@pharmaos/shared';
import { validate, params, query } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet } from '@/middleware/tenant';
import { heavyRateLimit } from '@/middleware/rate-limit';
import { exportEntity } from './export.service';

export const exportsRouter = Router();
exportsRouter.use(authenticate, resolveOutlet);

exportsRouter.get('/:entity', heavyRateLimit, validate({ params: z.object({ entity: z.enum(EXPORT_ENTITIES) }), query: exportQuerySchema }), async (req, res) => {
  const result = await exportEntity(ctxOf(req), params<{ entity: (typeof EXPORT_ENTITIES)[number] }>(req).entity, query<ExportQuery>(req));
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
  res.setHeader('X-Row-Count', String(result.rows));
  res.send(result.buffer);
});
