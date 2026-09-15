import { Router, type Request, type Response } from 'express';
import {
  createRoleSchema,
  updateRoleSchema,
  idParamSchema,
  paginationQuerySchema,
  PERMISSION_GROUPS,
  type CreateRoleInput,
  type UpdateRoleInput,
  type PaginationQuery,
} from '@pharmaos/shared';
import { validate, body, params, query } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { ok, created, noContent } from '@/lib/response';
import * as roles from './roles.service';

export const rolesRouter = Router();
rolesRouter.use(authenticate, resolveOutlet);

rolesRouter.get('/permissions', requirePermission(['roles.view', 'users.view'], 'any'), (_req: Request, res: Response) => {
  ok(res, PERMISSION_GROUPS);
});

rolesRouter.get('/', requirePermission(['roles.view', 'users.view'], 'any'), validate({ query: paginationQuerySchema }), async (req, res) => {
  ok(res, await roles.listRoles(ctxOf(req), query<PaginationQuery>(req)));
});

rolesRouter.get('/:id', requirePermission('roles.view'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await roles.getRole(ctxOf(req), params<{ id: string }>(req).id));
});

rolesRouter.post('/', requirePermission('roles.manage'), validate({ body: createRoleSchema }), async (req, res) => {
  created(res, await roles.createRole(ctxOf(req), body<CreateRoleInput>(req)));
});

rolesRouter.patch('/:id', requirePermission('roles.manage'), validate({ params: idParamSchema, body: updateRoleSchema }), async (req, res) => {
  ok(res, await roles.updateRole(ctxOf(req), params<{ id: string }>(req).id, body<UpdateRoleInput>(req)));
});

rolesRouter.delete('/:id', requirePermission('roles.manage'), validate({ params: idParamSchema }), async (req, res) => {
  await roles.deleteRole(ctxOf(req), params<{ id: string }>(req).id);
  noContent(res);
});
