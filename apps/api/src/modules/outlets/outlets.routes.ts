import { Router } from 'express';
import { z } from 'zod';
import { createOutletSchema, updateOutletSchema, idParamSchema, type CreateOutletInput, type UpdateOutletInput } from '@pharmaos/shared';
import { validate, body, params, query } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { ok, created } from '@/lib/response';
import * as outlets from './outlets.service';

export const outletsRouter = Router();
outletsRouter.use(authenticate, resolveOutlet);

const listQuery = z.object({ includeArchived: z.coerce.boolean().default(false) });

outletsRouter.get('/', validate({ query: listQuery }), async (req, res) => {
  ok(res, await outlets.listOutlets(ctxOf(req), query<{ includeArchived: boolean }>(req).includeArchived));
});

outletsRouter.get('/:id', validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await outlets.getOutlet(ctxOf(req), params<{ id: string }>(req).id));
});

outletsRouter.post('/', requirePermission('outlets.manage'), validate({ body: createOutletSchema }), async (req, res) => {
  created(res, await outlets.createOutlet(ctxOf(req), body<CreateOutletInput>(req)));
});

outletsRouter.patch('/:id', requirePermission('outlets.manage'), validate({ params: idParamSchema, body: updateOutletSchema }), async (req, res) => {
  ok(res, await outlets.updateOutlet(ctxOf(req), params<{ id: string }>(req).id, body<UpdateOutletInput>(req)));
});

outletsRouter.post('/:id/archive', requirePermission('outlets.manage'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await outlets.archiveOutlet(ctxOf(req), params<{ id: string }>(req).id));
});
