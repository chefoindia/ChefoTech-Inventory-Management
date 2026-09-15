import { Router } from 'express';
import { z } from 'zod';
import { createCustomFieldSchema, updateCustomFieldSchema, idParamSchema, CUSTOM_FIELD_ENTITIES, type CreateCustomFieldInput, type UpdateCustomFieldInput } from '@pharmaos/shared';
import { validate, body, params, query } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { ok, created, noContent } from '@/lib/response';
import * as svc from './custom-fields.service';

export const customFieldsRouter = Router();
customFieldsRouter.use(authenticate, resolveOutlet);

const listQuery = z.object({ entity: z.enum(CUSTOM_FIELD_ENTITIES).optional(), includeArchived: z.coerce.boolean().default(false) });

/** Any authenticated member may read definitions (forms need them); editing needs settings.customFields. */
customFieldsRouter.get('/', validate({ query: listQuery }), async (req, res) => {
  const q = query<{ entity?: string; includeArchived: boolean }>(req);
  ok(res, await svc.listDefinitions(ctxOf(req), q.entity, q.includeArchived));
});

customFieldsRouter.post('/', requirePermission('settings.customFields'), validate({ body: createCustomFieldSchema }), async (req, res) => {
  created(res, await svc.createDefinition(ctxOf(req), body<CreateCustomFieldInput>(req)));
});

customFieldsRouter.patch('/:id', requirePermission('settings.customFields'), validate({ params: idParamSchema, body: updateCustomFieldSchema }), async (req, res) => {
  ok(res, await svc.updateDefinition(ctxOf(req), params<{ id: string }>(req).id, body<UpdateCustomFieldInput>(req)));
});

customFieldsRouter.delete('/:id', requirePermission('settings.customFields'), validate({ params: idParamSchema }), async (req, res) => {
  await svc.archiveDefinition(ctxOf(req), params<{ id: string }>(req).id);
  noContent(res);
});
