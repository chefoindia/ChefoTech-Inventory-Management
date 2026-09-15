import { Router } from 'express';
import { updateOrganizationSchema, type UpdateOrganizationInput } from '@pharmaos/shared';
import { validate, body } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { ok } from '@/lib/response';
import * as organizations from './organizations.service';

export const organizationsRouter = Router();
organizationsRouter.use(authenticate, resolveOutlet);

organizationsRouter.get('/', requirePermission(['organization.view', 'settings.view'], 'any'), async (req, res) => {
  ok(res, await organizations.getOrganization(ctxOf(req)));
});

organizationsRouter.patch('/', requirePermission('organization.manage'), validate({ body: updateOrganizationSchema }), async (req, res) => {
  ok(res, await organizations.updateOrganization(ctxOf(req), body<UpdateOrganizationInput>(req)));
});
