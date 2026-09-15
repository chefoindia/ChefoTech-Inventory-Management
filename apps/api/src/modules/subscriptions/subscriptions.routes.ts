import { Router } from 'express';
import { changePlanSchema, type PlanKey } from '@pharmaos/shared';
import { validate, body } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { ok } from '@/lib/response';
import { ForbiddenError } from '@/lib/errors';
import { PLANS } from './plans';
import * as svc from './subscriptions.service';

export const subscriptionRouter = Router();

/** Public plan catalogue for the marketing site / pricing page. */
subscriptionRouter.get('/plans', (_req, res) => {
  ok(res, Object.values(PLANS));
});

subscriptionRouter.use(authenticate, resolveOutlet);

subscriptionRouter.get('/', requirePermission(['organization.view', 'settings.view'], 'any'), async (req, res) => {
  ok(res, await svc.getSubscription(ctxOf(req)));
});

subscriptionRouter.post('/change-plan', validate({ body: changePlanSchema }), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx.isOwner) throw new ForbiddenError('Only the owner can change the plan');
  ok(res, await svc.changePlan(ctx, body<{ planKey: PlanKey }>(req).planKey));
});
