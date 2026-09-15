import { Router } from 'express';
import { z } from 'zod';
import { createImportSchema, idParamSchema, IMPORT_ENTITIES, IMPORT_COLUMNS, type CreateImportInput } from '@pharmaos/shared';
import { validate, body, params } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet, requireOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { heavyRateLimit } from '@/middleware/rate-limit';
import { ok, created, noContent } from '@/lib/response';
import * as svc from './import.service';

export const importsRouter = Router();
importsRouter.use(authenticate, resolveOutlet);

const entityParam = z.object({ entity: z.enum(IMPORT_ENTITIES) });

importsRouter.get('/columns/:entity', requirePermission('data.import'), validate({ params: entityParam }), (req, res) => {
  ok(res, IMPORT_COLUMNS[params<{ entity: keyof typeof IMPORT_COLUMNS }>(req).entity]);
});

importsRouter.get('/template/:entity', requirePermission('data.import'), validate({ params: entityParam }), (req, res) => {
  const entity = params<{ entity: keyof typeof IMPORT_COLUMNS }>(req).entity;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="pharmaos-${entity}-template.csv"`);
  res.send(svc.templateCsv(entity));
});

importsRouter.get('/', requirePermission('data.import'), async (req, res) => {
  ok(res, await svc.listImports(ctxOf(req)));
});
importsRouter.get('/:id', requirePermission('data.import'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await svc.getImport(ctxOf(req), params<{ id: string }>(req).id));
});
importsRouter.post('/', requirePermission('data.import'), heavyRateLimit, validate({ body: createImportSchema }), async (req, res) => {
  created(res, await svc.createImport(ctxOf(req), body<CreateImportInput>(req)));
});
importsRouter.post('/:id/commit', requirePermission('data.import'), requireOutlet, validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await svc.commitImport(ctxOf(req), params<{ id: string }>(req).id));
});
importsRouter.delete('/:id', requirePermission('data.import'), validate({ params: idParamSchema }), async (req, res) => {
  await svc.discardImport(ctxOf(req), params<{ id: string }>(req).id);
  noContent(res);
});
