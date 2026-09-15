import { Router } from 'express';
import { dashboardQuerySchema } from '@pharmaos/shared';
import { validate, query } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { ok } from '@/lib/response';
import { dashboardSummary } from './dashboard.service';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate, resolveOutlet);

dashboardRouter.get('/summary', requirePermission('dashboard.view'), validate({ query: dashboardQuerySchema }), async (req, res) => {
  ok(res, await dashboardSummary(ctxOf(req), query<{ from?: Date; to?: Date; outletId?: string }>(req)));
});
