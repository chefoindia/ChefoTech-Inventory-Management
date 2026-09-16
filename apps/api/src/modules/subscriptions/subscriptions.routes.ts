import { Router } from 'express';
import { changePlanSchema, createCheckoutSchema, confirmCheckoutSchema, type PlanKey, type CreateCheckoutInput, type ConfirmCheckoutInput } from '@pharmaos/shared';
import { validate, body } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { ok } from '@/lib/response';
import { ForbiddenError } from '@/lib/errors';
import { PLANS } from './plans';
import * as svc from './subscriptions.service';
import * as billing from './billing.service';

export const subscriptionRouter = Router();

/** Public plan catalogue for the marketing site / pricing page. */
subscriptionRouter.get('/plans', (_req, res) => {
  ok(res, Object.values(PLANS));
});

/** Gateway webhook: verified by signature, never by session. Needs the raw body captured in app.ts. */
subscriptionRouter.post('/webhook', async (req, res) => {
  const raw = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
  ok(res, await billing.handleWebhook(raw, String(req.header('x-razorpay-signature') ?? '')));
});

subscriptionRouter.use(authenticate, resolveOutlet);

subscriptionRouter.get('/invoices', requirePermission(['organization.view', 'settings.view'], 'any'), async (req, res) => {
  ok(res, await billing.listInvoices(ctxOf(req)));
});
subscriptionRouter.post('/checkout', validate({ body: createCheckoutSchema }), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx.isOwner) throw new ForbiddenError('Only the owner can buy a plan');
  ok(res, await billing.createCheckout(ctx, body<CreateCheckoutInput>(req)));
});
subscriptionRouter.post('/checkout/confirm', validate({ body: confirmCheckoutSchema }), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx.isOwner) throw new ForbiddenError('Only the owner can buy a plan');
  ok(res, await billing.confirmCheckout(ctx, body<ConfirmCheckoutInput>(req)));
});

subscriptionRouter.get('/', requirePermission(['organization.view', 'settings.view'], 'any'), async (req, res) => {
  ok(res, await svc.getSubscription(ctxOf(req)));
});

subscriptionRouter.post('/change-plan', validate({ body: changePlanSchema }), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx.isOwner) throw new ForbiddenError('Only the owner can change the plan');
  ok(res, await svc.changePlan(ctx, body<{ planKey: PlanKey }>(req).planKey));
});
